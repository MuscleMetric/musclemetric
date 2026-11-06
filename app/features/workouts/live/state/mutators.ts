import type {
  LiveWorkoutDraft,
  LiveSetDraft,
  LiveExerciseDraft,
} from "./types";

// ---------- small utils ----------

function nowIso() {
  return new Date().toISOString();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Base sets are sets with dropIndex === 0.
 * Drop rows (dropIndex > 0) are "sub-sets" for dropsets.
 */
function baseSetCount(ex: LiveExerciseDraft) {
  return ex.sets.filter((s) => (s.dropIndex ?? 0) === 0).length || 1;
}

// ---------- navigation / UI ----------

export function openExercise(
  d: LiveWorkoutDraft,
  exerciseIndex: number
): LiveWorkoutDraft {
  const idx = clamp(exerciseIndex, 0, d.exercises.length - 1);
  return {
    ...d,
    ui: { ...d.ui, activeExerciseIndex: idx, activeSetNumber: 1 },
    updatedAt: nowIso(),
  };
}

export function setActiveSetNumber(
  d: LiveWorkoutDraft,
  setNumber: number
): LiveWorkoutDraft {
  const { activeExerciseIndex } = d.ui;
  const ex = d.exercises[activeExerciseIndex];
  const maxSet = ex ? baseSetCount(ex) : 1;

  return {
    ...d,
    ui: { ...d.ui, activeSetNumber: clamp(setNumber, 1, maxSet) },
    updatedAt: nowIso(),
  };
}

export function goPrevSet(d: LiveWorkoutDraft): LiveWorkoutDraft {
  return setActiveSetNumber(d, d.ui.activeSetNumber - 1);
}

export function goNextSet(d: LiveWorkoutDraft): LiveWorkoutDraft {
  return setActiveSetNumber(d, d.ui.activeSetNumber + 1);
}

// ---------- set editing ----------

export function updateSetValue(
  d: LiveWorkoutDraft,
  args: {
    exerciseIndex: number;
    setNumber: number;
    field: "reps" | "weight" | "timeSeconds" | "distance";
    value: number | null;
  }
): LiveWorkoutDraft {
  const ex = d.exercises[args.exerciseIndex];
  if (!ex) return d;

  const nextSets = ex.sets.map((s) =>
    s.setNumber === args.setNumber && (s.dropIndex ?? 0) === 0
      ? { ...s, [args.field]: args.value }
      : s
  );

  const nextExercises = d.exercises.slice();
  nextExercises[args.exerciseIndex] = { ...ex, sets: nextSets };

  return { ...d, exercises: nextExercises, updatedAt: nowIso() };
}

export function addSet(
  d: LiveWorkoutDraft,
  exerciseIndex: number
): LiveWorkoutDraft {
  const ex = d.exercises[exerciseIndex];
  if (!ex) return d;

  // base sets only
  const baseSets = ex.sets.filter((s) => (s.dropIndex ?? 0) === 0);
  const lastSetNum = baseSets.length
    ? baseSets[baseSets.length - 1].setNumber
    : 0;

  const nextSetNumber = Math.min(20, lastSetNum + 1);

  const newSet: LiveSetDraft = {
    setNumber: nextSetNumber,
    dropIndex: 0,
    reps: null,
    weight: null,
    timeSeconds: null,
    distance: null,
    notes: null,
  };

  const nextExercises = d.exercises.slice();
  nextExercises[exerciseIndex] = {
    ...ex,
    sets: [...ex.sets, newSet].sort((a, b) => {
      if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber;
      return (a.dropIndex ?? 0) - (b.dropIndex ?? 0);
    }),
  };

  const ui =
    d.ui.activeExerciseIndex === exerciseIndex
      ? {
          ...d.ui,
          activeSetNumber: clamp(
            d.ui.activeSetNumber,
            1,
            baseSetCount(nextExercises[exerciseIndex] as LiveExerciseDraft)
          ),
        }
      : d.ui;

  return { ...d, exercises: nextExercises, ui, updatedAt: nowIso() };
}

export function removeSet(
  d: LiveWorkoutDraft,
  exerciseIndex: number
): LiveWorkoutDraft {
  const ex = d.exercises[exerciseIndex];
  if (!ex) return d;

  const baseSets = ex.sets.filter((s) => (s.dropIndex ?? 0) === 0);
  if (baseSets.length <= 1) return d;

  const lastBaseSetNumber = baseSets[baseSets.length - 1].setNumber;

  // remove base set + any drop rows under that setNumber
  const nextSets = ex.sets.filter((s) => s.setNumber !== lastBaseSetNumber);

  const nextExercises = d.exercises.slice();
  nextExercises[exerciseIndex] = { ...ex, sets: nextSets };

  const ui =
    d.ui.activeExerciseIndex === exerciseIndex
      ? {
          ...d.ui,
          activeSetNumber: Math.min(
            d.ui.activeSetNumber,
            baseSetCount(nextExercises[exerciseIndex] as LiveExerciseDraft)
          ),
        }
      : d.ui;

  return { ...d, exercises: nextExercises, ui, updatedAt: nowIso() };
}

// ---------- dropset (exercise-level flag) ----------
// (you may later remove this if exercises are strictly pre-marked)

export function setExerciseDropSet(
  d: LiveWorkoutDraft,
  args: { exerciseIndex: number; value: boolean }
): LiveWorkoutDraft {
  const ex = d.exercises[args.exerciseIndex];
  if (!ex) return d;

  const nextExercises = d.exercises.slice();
  nextExercises[args.exerciseIndex] = {
    ...ex,
    prescription: { ...ex.prescription, isDropset: args.value },
  };

  return { ...d, exercises: nextExercises, updatedAt: nowIso() };
}

export function toggleExerciseDropSet(
  d: LiveWorkoutDraft,
  exerciseIndex: number
): LiveWorkoutDraft {
  const ex = d.exercises[exerciseIndex];
  if (!ex) return d;
  const cur = Boolean(ex.prescription?.isDropset);
  return setExerciseDropSet(d, { exerciseIndex, value: !cur });
}

// ---------- dropset (per-set drop rows) ----------

function getDropRows(ex: LiveExerciseDraft, setNumber: number) {
  return (ex.sets ?? [])
    .filter((s) => s.setNumber === setNumber && (s.dropIndex ?? 0) > 0)
    .sort((a, b) => (a.dropIndex ?? 0) - (b.dropIndex ?? 0));
}

export function initDropSetForSet(
  d: LiveWorkoutDraft,
  args: { exerciseIndex: number; setNumber: number }
): LiveWorkoutDraft {
  const ex = d.exercises[args.exerciseIndex];
  if (!ex) return d;

  const existing = getDropRows(ex, args.setNumber);
  if (existing.length) return d;

  const newDrop: LiveSetDraft = {
    setNumber: args.setNumber,
    dropIndex: 1,
    reps: null,
    weight: null,
    timeSeconds: null,
    distance: null,
    notes: null,
  };

  const nextExercises = d.exercises.slice();
  nextExercises[args.exerciseIndex] = {
    ...ex,
    sets: [...ex.sets, newDrop].sort((a, b) => {
      if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber;
      return (a.dropIndex ?? 0) - (b.dropIndex ?? 0);
    }),
  };

  return { ...d, exercises: nextExercises, updatedAt: nowIso() };
}

export function clearDropSetForSet(
  d: LiveWorkoutDraft,
  args: { exerciseIndex: number; setNumber: number }
): LiveWorkoutDraft {
  const ex = d.exercises[args.exerciseIndex];
  if (!ex) return d;

  const nextSets = ex.sets.filter(
    (s) => !(s.setNumber === args.setNumber && (s.dropIndex ?? 0) > 0)
  );

  const nextExercises = d.exercises.slice();
  nextExercises[args.exerciseIndex] = { ...ex, sets: nextSets };

  return { ...d, exercises: nextExercises, updatedAt: nowIso() };
}

export function addDrop(
  d: LiveWorkoutDraft,
  args: { exerciseIndex: number; setNumber: number }
): LiveWorkoutDraft {
  const ex = d.exercises[args.exerciseIndex];
  if (!ex) return d;

  const drops = getDropRows(ex, args.setNumber);
  const nextIdx = Math.min(20, (drops[drops.length - 1]?.dropIndex ?? 0) + 1);

  const newDrop: LiveSetDraft = {
    setNumber: args.setNumber,
    dropIndex: nextIdx,
    reps: null,
    weight: null,
    timeSeconds: null,
    distance: null,
    notes: null,
  };

  const nextExercises = d.exercises.slice();
  nextExercises[args.exerciseIndex] = {
    ...ex,
    sets: [...ex.sets, newDrop].sort((a, b) => {
      if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber;
      return (a.dropIndex ?? 0) - (b.dropIndex ?? 0);
    }),
  };

  return { ...d, exercises: nextExercises, updatedAt: nowIso() };
}

export function updateDropSetValue(
  d: LiveWorkoutDraft,
  args: {
    exerciseIndex: number;
    setNumber: number;
    dropIndex: number;
    field: "reps" | "weight";
    value: number | null;
  }
): LiveWorkoutDraft {
  const ex = d.exercises[args.exerciseIndex];
  if (!ex) return d;

  const nextSets = ex.sets.map((s) => {
    if (s.setNumber !== args.setNumber) return s;
    if ((s.dropIndex ?? 0) !== args.dropIndex) return s;
    return { ...s, [args.field]: args.value };
  });

  const nextExercises = d.exercises.slice();
  nextExercises[args.exerciseIndex] = { ...ex, sets: nextSets };

  return { ...d, exercises: nextExercises, updatedAt: nowIso() };
}

export function getBaseSetCount(d: LiveWorkoutDraft, exerciseIndex: number) {
  const ex = d.exercises[exerciseIndex];
  return ex ? baseSetCount(ex) : 1;
}

export function removeDrop(
  d: LiveWorkoutDraft,
  args: { exerciseIndex: number; setNumber: number }
): LiveWorkoutDraft {
  const ex = d.exercises[args.exerciseIndex];
  if (!ex) return d;

  const drops = getDropRows(ex, args.setNumber);

  // Keep at least 2 drops if you're enforcing that rule in UI
  if (drops.length <= 1) return d;

  const last = drops[drops.length - 1];
  const lastDropIndex = last?.dropIndex ?? null;
  if (!lastDropIndex) return d;

  const nextSets = ex.sets.filter(
    (s) =>
      !(s.setNumber === args.setNumber && (s.dropIndex ?? 0) === lastDropIndex)
  );

  const nextExercises = d.exercises.slice();
  nextExercises[args.exerciseIndex] = { ...ex, sets: nextSets };

  return { ...d, exercises: nextExercises, updatedAt: nowIso() };
}

// ---------- SUPERSET NAV (superset-aware Next Set) ----------

function getSupersetGroupNodes(d: LiveWorkoutDraft, group: string) {
  return d.exercises
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.prescription?.supersetGroup === group)
    .sort(
      (a, b) =>
        (a.e.prescription?.supersetIndex ?? 0) -
        (b.e.prescription?.supersetIndex ?? 0)
    );
}

/**
 * Next eligible exercise AFTER current position (NO WRAP).
 * Prevents: B1 -> A1 for same set.
 */
function nextEligibleInGroupNoWrap(
  d: LiveWorkoutDraft,
  group: string,
  fromPos: number,
  setNumber: number
) {
  const nodes = getSupersetGroupNodes(d, group);
  if (nodes.length < 2) return null;

  for (let pos = fromPos + 1; pos < nodes.length; pos++) {
    const node = nodes[pos];
    if (baseSetCount(node.e) >= setNumber) return { nodes, pos, node };
  }
  return null;
}

function firstEligibleInGroupForSet(
  d: LiveWorkoutDraft,
  group: string,
  setNumber: number
) {
  const nodes = getSupersetGroupNodes(d, group);
  for (let pos = 0; pos < nodes.length; pos++) {
    const node = nodes[pos];
    if (baseSetCount(node.e) >= setNumber) return { nodes, pos, node };
  }
  return null;
}

/**
 * ✅ Peek the next destination for "Next Set" without mutating draft.
 * Used by the modal to decide whether the primary button should be "Next" or "Complete".
 */
export function peekNextSupersetAware(d: LiveWorkoutDraft): {
  exerciseIndex: number;
  setNumber: number;
} | null {
  const exIdx = d.ui.activeExerciseIndex;
  const ex = d.exercises[exIdx];
  if (!ex) return null;

  const group = ex.prescription?.supersetGroup ?? null;

  // ---- Non-superset ----
  if (!group || !group.trim()) {
    const maxSet = baseSetCount(ex);
    const nextSet = clamp(d.ui.activeSetNumber + 1, 1, maxSet);
    if (nextSet === d.ui.activeSetNumber) return null;
    return { exerciseIndex: exIdx, setNumber: nextSet };
  }

  const nodes = getSupersetGroupNodes(d, group);
  if (nodes.length < 2) {
    const maxSet = baseSetCount(ex);
    const nextSet = clamp(d.ui.activeSetNumber + 1, 1, maxSet);
    if (nextSet === d.ui.activeSetNumber) return null;
    return { exerciseIndex: exIdx, setNumber: nextSet };
  }

  const setNumber = d.ui.activeSetNumber;

  const curPos = nodes.findIndex((n) => n.i === exIdx);
  const safeCurPos = curPos >= 0 ? curPos : 0;

  // 1) next exercise in group, same setNumber (NO WRAP)
  const nextNoWrap = nextEligibleInGroupNoWrap(d, group, safeCurPos, setNumber);
  if (nextNoWrap) {
    return { exerciseIndex: nextNoWrap.node.i, setNumber };
  }

  // 2) end of group -> increment setNumber, wrap to first eligible
  const nextSetNumber = setNumber + 1;
  const firstNext = firstEligibleInGroupForSet(d, group, nextSetNumber);
  if (firstNext) {
    return { exerciseIndex: firstNext.node.i, setNumber: nextSetNumber };
  }

  // 3) group finished
  return null;
}

export function goNextSupersetAware(d: LiveWorkoutDraft): LiveWorkoutDraft {
  const next = peekNextSupersetAware(d);
  if (!next) return d;

  return {
    ...d,
    ui: {
      ...d.ui,
      activeExerciseIndex: next.exerciseIndex,
      activeSetNumber: next.setNumber,
    },
    updatedAt: nowIso(),
  };
}

// --- SWAP EXERCISE ---

type SwapExerciseArgs = {
  exerciseIndex: number;
  newExercise: {
    exerciseId: string;
    name: string;
    equipment: string | null;
    type: string | null;
    level: string | null;
    instructions: string | null;
  };
  /**
   * If true, clears superset metadata when swapping.
   * Default false (keeps group/index so A/B doesn't break mid-workout).
   */
  resetSuperset?: boolean;
  /**
   * If true, clears dropset toggle on the swapped-in exercise.
   * Default false (keeps user's "isDropset" choice if they had toggled it).
   */
  resetDropsetFlag?: boolean;
};

export function swapExercise(
  d: LiveWorkoutDraft,
  args: SwapExerciseArgs
): LiveWorkoutDraft {
  const idx = clamp(args.exerciseIndex, 0, d.exercises.length - 1);
  const cur = d.exercises[idx];
  if (!cur) return d;

  // avoid no-op
  if (cur.exerciseId === args.newExercise.exerciseId) return d;

  // keep same number of BASE sets the user is working with right now
  const baseCount = baseSetCount(cur);

  const nextPrescription = {
    ...cur.prescription,
    ...(args.resetSuperset
      ? { supersetGroup: null, supersetIndex: null }
      : null),
    ...(args.resetDropsetFlag ? { isDropset: false } : null),
  };

  const next: LiveExerciseDraft = {
    ...cur,

    // new exercise identity + snapshot
    exerciseId: args.newExercise.exerciseId,
    name: args.newExercise.name,
    equipment: args.newExercise.equipment,
    type: args.newExercise.type,
    level: args.newExercise.level,
    instructions: args.newExercise.instructions,

    // IMPORTANT: swapped exercise isn't persisted as a workout_exercise row yet
    workoutExerciseId: null,

    // keep prescription (targets, notes) but optionally reset superset/dropset flags
    prescription: nextPrescription,

    // new exercise => last session info + PRs should be cleared until you load them
    lastSession: { completedAt: null, sets: [] },
    historyResolved: false,
    historyStatsResolved: false,
    bestSet6m: null,
    bestE1rm6m: null,
    totalVolumeAllTime: null,

    // reset completion and all entered set data
    isDone: false,

    // regenerate clean base sets (dropIndex 0 only) for the same count
    sets: makeEmptyBaseSets(baseCount),
  };

  const nextExercises = d.exercises.slice();
  nextExercises[idx] = next;

  // keep UI stable; clamp set number to new base count
  const nextUi =
    d.ui.activeExerciseIndex === idx
      ? {
          ...d.ui,
          activeSetNumber: clamp(d.ui.activeSetNumber, 1, baseCount),
        }
      : d.ui;

  return {
    ...d,
    exercises: nextExercises,
    ui: nextUi,
    updatedAt: nowIso(),
  };
}

/**
 * Optional helper if your picker only returns an id.
 * You provide a lookup function that returns the snapshot fields we store.
 */
export function swapExerciseById(
  d: LiveWorkoutDraft,
  args: {
    exerciseIndex: number;
    newExerciseId: string;
    lookup: (exerciseId: string) => {
      exerciseId: string;
      name: string;
      equipment: string | null;
      type: string | null;
      level: string | null;
      instructions: string | null;
    } | null;
    resetSuperset?: boolean;
    resetDropsetFlag?: boolean;
  }
): LiveWorkoutDraft {
  const snap = args.lookup(args.newExerciseId);
  if (!snap) return d;
  return swapExercise(d, {
    exerciseIndex: args.exerciseIndex,
    newExercise: snap,
    resetSuperset: args.resetSuperset,
    resetDropsetFlag: args.resetDropsetFlag,
  });
}

function makeEmptyBaseSets(count: number): LiveSetDraft[] {
  const n = clamp(count, 1, 20);
  const out: LiveSetDraft[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      setNumber: i,
      dropIndex: 0,
      reps: null,
      weight: null,
      timeSeconds: null,
      distance: null,
      notes: null,
    });
  }
  return out;
}
