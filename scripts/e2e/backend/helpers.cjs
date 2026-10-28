"use strict";
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { workoutPayload, assertIsDisposableLocalDatabase } = require('../tester-workout-flow.cjs');
const report = require('../production-report.cjs');
function data(result, label) {
  return report.check(label, () => {
    if (result.error) throw new Error(label + ': ' + result.error.message + ' [' + result.error.code + ']');
    return result.data;
  });
}
function equal(actual, expected, label) {
  return report.check(label, () => assert.deepEqual(actual, expected, label),
    { expected: JSON.stringify(expected), actual: JSON.stringify(actual) });
}
function denied(result, label) {
  report.check(label, () => {
    assert.ok(result.error, label + ': expected authorization rejection');
    assert.ok(['42501', 'P0001'].includes(result.error.code), label + ': unexpected error ' + result.error.code);
    assert.match(result.error.message, /not.allowed|not.found|auth|permission|owner|row.level|access|block/i);
  });
}
function makeContext() {
  const url = process.env.API_URL, anonKey = process.env.ANON_KEY, serviceKey = process.env.SERVICE_ROLE_KEY;
  assertIsDisposableLocalDatabase(url); // Before constructing any client or using service credentials.
  assert.ok(anonKey && serviceKey, 'Local Supabase credentials required');
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const ctx = { url, anonKey, options, accounts: [], exercises: [], failures: [],
    admin: createClient(url, serviceKey, options),
    client: extra => createClient(url, anonKey, { ...options, ...extra }) };
  ctx.run = async (id, fn) => {
    try { return await report.run(id, fn); }
    catch (error) { ctx.failures.push(id); console.error('FAIL ' + id + ': ' + report.sanitize(error.message)); }
  };
  ctx.account = async label => {
    const email = 'backend-' + randomUUID() + '@example.invalid';
    const password = 'E2E-' + randomBytes(24).toString('base64url') + '!9';
    const user = data(await ctx.admin.auth.admin.createUser({ email, password, email_confirm: true }), 'Create disposable ' + label).user;
    const account = { id: user.id, email, password, client: ctx.client() }; ctx.accounts.push(account);
    data(await ctx.admin.from('profiles').upsert({ id: user.id, name: 'Backend ' + label, email,
      username: 'e2e_' + user.id.replaceAll('-', '').slice(0,16), visibility: 'public', timezone: 'UTC' }), 'Create profile');
    data(await account.client.auth.signInWithPassword({ email, password }), 'Sign in ' + label);
    return account;
  };
  ctx.reconnect = async (account, extra) => {
    const client = ctx.client(extra);
    data(await client.auth.signInWithPassword({ email: account.email, password: account.password }), 'Reconnect new client');
    return client;
  };
  ctx.exercise = async (type, label) => {
    const id = randomUUID(); ctx.exercises.push(id);
    data(await ctx.admin.from('exercises').insert({ id, name: 'Backend ' + label + ' ' + id, type, equipment: 'Bodyweight', is_public: true }), 'Seed exercise');
    return id;
  };
  return ctx;
}
function payload(exerciseId, sets, date, id = randomUUID()) {
  return { ...workoutPayload({ clientSaveId: id, label: 'backend-' + id,
    exercises: [{ id: exerciseId, sets }] }), ...(date ? { completed_at: date } : {}) };
}
async function save(account, body, client = account.client) {
  return data(await client.rpc('save_completed_workout_v2', { p_workout: body, p_expected_user_id: account.id }), 'Save owned workout');
}
async function rpc(client, name, args) { return data(await client.rpc(name, args), name); }
async function storedTree(ctx, userId, saveId) {
  const rows = data(await ctx.admin.from('workout_history').select('id,user_id').eq('user_id', userId).eq('client_save_id', saveId), 'Read committed save count');
  const exerciseRows = rows.length ? data(await ctx.admin.from('workout_exercise_history').select('id').in('workout_history_id',rows.map(r=>r.id)), 'Read exercise rows') : [];
  const sets = exerciseRows.length ? data(await ctx.admin.from('workout_set_history').select('id').in('workout_exercise_history_id',exerciseRows.map(r=>r.id)), 'Read set rows') : [];
  return { rows, exercises: exerciseRows, sets };
}
async function createPost(account, workoutId, visibility) {
  return rpc(account.client, 'create_post_v2', { p_caption: 'Backend ' + visibility, p_exercise_id: null,
    p_post_type: 'workout', p_pr_reps: null, p_pr_weight: null, p_visibility: visibility, p_workout_history_id: workoutId });
}
module.exports = { assert, randomUUID, data, equal, denied, makeContext, payload, save, rpc, storedTree, createPost };
