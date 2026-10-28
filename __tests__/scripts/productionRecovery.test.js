/* global beforeEach, describe, it, expect */
const { randomUUID } = require('node:crypto');
const { stages, resolvePlans, settingsHash } = require('../../scripts/e2e/production-known-history.cjs');
const { verifyTesterPlanFlow } = require('../../scripts/e2e/tester-plan-flow.cjs');

// In-memory PostgREST double: execute the real cleanup orchestration, including
// predicates, cascades, independent failure handling and final baseline checks.
function fixture({ edited = true, knownId = true, partial = false } = {}) {
  const userId = randomUUID(), runId = randomUUID(), planId = randomUUID();
  const marker = 'AUTOMATED_E2E_FIXTURE ' + runId;
  const title = 'AUTOMATED_E2E_PLAN_' + runId;
  const templateId = randomUUID();
  const state = { userId, runId, marker, planId: knownId ? planId : null,
    baseline: { workout_history: 0, posts: 0, plans: 0, goals: 0,
      active_plan_id: null, weekly_workout_goal: 3, settingsHash: settingsHash({ unit: 'kg' }),
      existingWorkoutIds: [templateId], notificationCount: 0 },
    workouts: Array.from({ length: 4 }, (_, i) => ({ clientSaveId: randomUUID(),
      notes: marker + '-' + i, historyId: null })),
    posts: [{ caption: marker + ' private-workout-post', postId: null }] };
  const postId = randomUUID();
  const db = {
    profiles: [{ id: userId, active_plan_id: partial ? null : planId, weekly_workout_goal: 3, settings: { unit: 'kg' } }],
    plans: partial ? [] : [{ id: planId, user_id: userId, title: title + (edited ? '_EDITED' : '') }],
    goals: partial ? [] : [{ id: randomUUID(), user_id: userId, plan_id: planId }],
    workouts: [{ id: templateId, user_id: userId, title: 'Original template' },
      ...partial ? [] : [{ id: randomUUID(), user_id: userId, created_source: 'plan_clone', title: 'Strength B [E2E_' + runId + ']' }]],
    workout_history: state.workouts.slice(0, partial ? 1 : 4).map(w => ({ id: randomUUID(), user_id: userId,
      client_save_id: w.clientSaveId, notes: w.notes })),
    posts: partial ? [] : [{ id: postId, user_id: userId, caption: state.posts[0].caption, visibility: 'private' }],
    post_comments: partial ? [] : [{ id: randomUUID(), post_id: postId }],
    post_likes: [], notifications: [],
  };
  const failures = new Set();
  const client = { auth: { signOut: async () => {} }, from(table) {
    let operation = 'select', patch, options, single = false;
    const filters = [];
    const query = {
      select(columns, opts) { options = opts; return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      like(key, value) { filters.push(row => row[key]?.endsWith(value.slice(1))); return query; },
      single() { single = true; return query; },
      delete() { operation = 'delete'; return query; },
      update(value) { operation = 'update'; patch = value; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (failures.has(table + ':' + operation)) return { error: { message: 'Injected failure', code: 'TEST' }, data: null };
          const rows = (db[table] || []).filter(row => filters.every(f => f(row)));
          if (operation === 'delete') {
            db[table] = db[table].filter(row => !rows.includes(row));
            if (table === 'plans') db.goals = db.goals.filter(g => !rows.some(r => r.id === g.plan_id));
            if (table === 'posts') {
              for (const child of ['post_comments', 'post_likes']) db[child] = db[child].filter(c => !rows.some(r => r.id === c.post_id));
            }
          }
          if (operation === 'update') rows.forEach(row => Object.assign(row, patch));
          return { data: single ? rows[0] : rows, count: options?.count ? rows.length : null, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { state, db, client, failures, planId };
}
async function clean(f) {
  return stages.cleanup({ state: f.state, connectImpl: async () => ({ client: f.client }), removeManifest: () => {} });
}
beforeEach(() => { delete process.env.MM_ALLURE_RESULTS; });

describe('production recovery', () => {
  it.each([[false, true], [true, true], [false, false], [true, false]])(
    'restores original/edited plans (edited=%s, saved ID=%s)', async (edited, knownId) => {
      const f = fixture({ edited, knownId });
      await clean(f);
      expect(f.db.plans).toEqual([]);
      expect(f.db.goals).toEqual([]);
      expect(f.db.profiles[0].active_plan_id).toBeNull();
      expect(f.db.workouts.map(w => w.id)).toEqual(f.state.baseline.existingWorkoutIds);
      expect(f.db.post_comments).toEqual([]);
    });
  it('recovers partial seeding from pre-write IDs with no acknowledged history IDs', async () => {
    const f = fixture({ partial: true, knownId: false });
    await clean(f);
    expect(f.db.workout_history).toEqual([]);
  });
  it('is safe to repeat using the original pre-write manifest', async () => {
    const f = fixture({ knownId: false });
    const original = JSON.parse(JSON.stringify(f.state));
    await clean(f);
    f.state = original;
    await clean(f);
    expect(f.db.workouts).toHaveLength(1);
  });
  it('continues other cleanup categories when post deletion fails, then fails the run', async () => {
    const f = fixture();
    f.failures.add('posts:delete');
    await expect(clean(f)).rejects.toThrow('private posts');
    expect(f.db.workout_history).toEqual([]);
    expect(f.db.plans).toEqual([]);
    expect(f.db.posts).toHaveLength(1);
  });
  it('preserves unrelated history and refuses to claim restored baseline', async () => {
    const f = fixture();
    const unrelated = { id: randomUUID(), user_id: f.state.userId, client_save_id: randomUUID(), notes: 'Keep me' };
    f.db.workout_history.push(unrelated);
    await expect(clean(f)).rejects.toThrow('baseline');
    expect(f.db.workout_history).toEqual([unrelated]);
  });
  it('refuses a known plan ID whose marker changed', async () => {
    const f = fixture(); f.db.plans[0].title = 'Unrelated plan';
    await expect(resolvePlans(f.client, f.state)).rejects.toThrow('Plan marker mismatch');
    expect(f.db.plans).toHaveLength(1);
  });
  it('does not overwrite an unrelated active plan', async () => {
    const f = fixture(); const unrelatedId = randomUUID();
    f.db.profiles[0].active_plan_id = unrelatedId;
    await expect(clean(f)).rejects.toThrow('do not overwrite');
    expect(f.db.profiles[0].active_plan_id).toBe(unrelatedId);
  });
  it('rejects a workout whose pre-registered ID has the wrong marker', async () => {
    const f = fixture(); f.db.workout_history[0].notes = 'Unrelated';
    await expect(clean(f)).rejects.toThrow('Workout marker mismatch');
    expect(f.db.workout_history).toHaveLength(4);
  });
  it('persists the plan ID before a later read or assertion can fail', async () => {
    const planId = randomUUID(), ids = [];
    let calls = 0;
    const client = { rpc: async () => ++calls === 1 ? { error: { message: 'Denied' } } : { data: planId },
      from: () => { throw new Error('Read failed after committed create'); } };
    await expect(verifyTesterPlanFlow({ userClient: client, userId: randomUUID(),
      exerciseIds: [randomUUID(), randomUUID()], runLabel: randomUUID(),
      onPlanCreated: id => ids.push(id) })).rejects.toThrow('Read failed');
    expect(ids).toEqual([planId]);
  });
});
