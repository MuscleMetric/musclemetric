// app/features/workouts/live/modals/ExerciseEntryModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TextInput,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/lib/useAppTheme";
import type { LiveWorkoutDraft } from "../state/types";
import { getActiveExercise, hasSetData } from "../state/selectors";

import { ModalHeaderRow } from "./sections/ModalHeaderRow";
import { SupersetSwitcher } from "./sections/SupersetSwitcher";
import { TechniqueCues } from "./sections/TechniqueCues";
import { DropsetToggleRow } from "./sections/DropsetToggleRow";
import { DropsetEditor } from "./sections/DropsetEditor";
import { StrengthStatsCards } from "./sections/StrengthStatsCards";
import { LastSessionSummary } from "./sections/LastSessionSummary";
import { StrengthInputs } from "./sections/StrengthInputs";
import { CardioInputs } from "./sections/CardioInputs";
import { TimedWeightInputs } from "./sections/TimedWeightInputs";
import { BottomActions } from "./sections/BottomActions";

import * as M from "../state/mutators";
import {
  sanitizeRepsInput,
  sanitizeWeightInput,
  clampInt,
} from "./helpers/inputSanitizers";
import {
  computeSessionVolume,
  bestSetByE1rm,
  pickBestStrengthSource,
} from "./helpers/strengthMath";
import { pickLastSessionSet } from "./helpers/historyPickers";
import { getExerciseLoggingProfile } from "../../logging/exerciseLoggingProfile";
import {
  getBaseSetCount,
  getDropRowsForSetNumber,
  dropModeForSet,
} from "./helpers/dropset";
import { parseNullableNumber } from "./helpers/cardio";

export function ExerciseEntryModal(props: {
  visible: boolean;
  onClose: () => void;
  draft: LiveWorkoutDraft;

  onUpdateSetValue: (args: {
    exerciseIndex: number;
    setNumber: number;
    field: "reps" | "weight" | "timeSeconds" | "distance";
    value: number | null;
  }) => void;

  onAddSet: (exerciseIndex: number) => void;
  onRemoveSet: (exerciseIndex: number) => void;

  onPrevSet: () => void;
  onNextSet: () => void;

  onSwapExercise?: () => void;
  onJumpToExercise?: (exerciseIndex: number) => void;

  onToggleDropset?: (exerciseIndex: number, value: boolean) => void;

  onInitDropSetForSet?: (args: {
    exerciseIndex: number;
    setNumber: number;
  }) => void;
  onClearDropSetForSet?: (args: {
    exerciseIndex: number;
    setNumber: number;
  }) => void;
  onAddDrop?: (args: { exerciseIndex: number; setNumber: number }) => void;
  onUpdateDropSetValue?: (args: {
    exerciseIndex: number;
    setNumber: number;
    dropIndex: number;
    field: "reps" | "weight";
    value: number | null;
  }) => void;
  onRemoveDrop?: (args: { exerciseIndex: number; setNumber: number }) => void;
}) {
  const { colors, typography } = useAppTheme();
  const insets = useSafeAreaInsets();

  const { index, exercise } = useMemo(
    () => getActiveExercise(props.draft),
    [props.draft],
  );

  const setNumber = props.draft.ui.activeSetNumber;

  const set =
    exercise?.sets.find(
      (s) => s.setNumber === setNumber && (s.dropIndex ?? 0) === 0,
    ) ?? null;

  const loggingProfile = exercise ? getExerciseLoggingProfile(exercise) : null;

  const cardio = loggingProfile?.loggingType === "cardio";

  const timed =
    loggingProfile?.loggingType === "timed" ||
    loggingProfile?.loggingType === "timed_weighted";

  const strengthLike =
    loggingProfile?.loggingType === "strength" ||
    loggingProfile?.loggingType === "bodyweight_weighted" ||
    loggingProfile?.loggingType === "assisted";

  const targets = (props.draft.sessionTargets?.[exercise?.exerciseId ?? ""] ?? []).filter(target =>
    loggingProfile?.supportsReps && (target.weight == null ||
      (loggingProfile.supportsWeight && !loggingProfile.supportsAssistance))
  );

  const baseSetCount = useMemo(() => {
    if (!exercise) return 1;
    return getBaseSetCount(exercise);
  }, [exercise]);

  const lastIsCompleteButton = useMemo(() => {
    const next = M.peekNextSupersetAware(props.draft);
    return !next;
  }, [props.draft]);

  const [weightText, setWeightText] = useState("");
  const [repsText, setRepsText] = useState("");
  const weightRef = useRef<TextInput | null>(null);
  const repsRef = useRef<TextInput | null>(null);

  const [distanceText, setDistanceText] = useState("");
  const [minutesText, setMinutesText] = useState("");
  const [secondsText, setSecondsText] = useState("");

  const sessionVolume = useMemo(() => {
    if (!exercise || !loggingProfile?.canComputeVolume) return 0;
    return computeSessionVolume(exercise);
  }, [exercise, cardio]);

  const bestNow = useMemo(() => {
    if (!exercise || !loggingProfile?.canComputeE1rm) return null;
    return bestSetByE1rm(exercise);
  }, [exercise, cardio]);

  const prDelta = useMemo(() => {
    if (!exercise || !loggingProfile?.canComputeE1rm) return null;
    if (!bestNow) return null;
    if (!exercise.bestE1rm6m) return null;
    return bestNow.est - exercise.bestE1rm6m;
  }, [exercise, cardio, bestNow]);

  const supersetGroup = exercise?.prescription?.supersetGroup ?? null;

  const eligibleDropset =
    Boolean(loggingProfile?.canShowDropset) &&
    Boolean(exercise?.prescription?.isDropset);

  const dropRows = useMemo(() => {
    if (!exercise || !eligibleDropset) return [];
    return getDropRowsForSetNumber(exercise, setNumber);
  }, [exercise, eligibleDropset, setNumber]);

  const dropMode = exercise
    ? eligibleDropset && dropModeForSet(exercise, setNumber)
    : false;

  const canRemoveDrop = Boolean(
    eligibleDropset && dropMode && dropRows.length > 1,
  );

  const ENABLE_AUTOFILL = false;

  const lastSessionSets = exercise?.lastSession?.sets ?? [];
  const lastCompletedAt = exercise?.lastSession?.completedAt ?? null;

  const lastSessionVolume = useMemo(() => {
    if (!exercise || !loggingProfile?.canComputeVolume) return null;
    if (!Array.isArray(lastSessionSets) || lastSessionSets.length === 0) {
      return null;
    }

    let total = 0;

    for (const s of lastSessionSets as any[]) {
      const reps = s?.reps;
      const weight = s?.weight;

      if (reps == null || weight == null) continue;
      if (!Number.isFinite(Number(reps)) || !Number.isFinite(Number(weight))) {
        continue;
      }
      if (Number(reps) <= 0 || Number(weight) < 0) continue;

      total += Number(reps) * Number(weight);
    }

    return total > 0 ? total : 0;
  }, [exercise, cardio, lastSessionSets]);

  const volDelta = useMemo(() => {
    if (!exercise || !loggingProfile?.canComputeVolume) return null;
    if (lastSessionVolume == null) return null;
    return sessionVolume - lastSessionVolume;
  }, [exercise, cardio, sessionVolume, lastSessionVolume]);

  function commitWeightText(t: string) {
    const s = sanitizeWeightInput(t);
    setWeightText(s);

    if (!s || s === "." || s === "0" || s === "0.") {
      props.onUpdateSetValue({
        exerciseIndex: index,
        setNumber,
        field: "weight",
        value: null,
      });
      return;
    }

    const n = Number(s);
    if (!Number.isFinite(n)) return;

    const safe = Math.max(0, Math.round(n * 100) / 100);
    props.onUpdateSetValue({
      exerciseIndex: index,
      setNumber,
      field: "weight",
      value: safe,
    });
  }

  function commitRepsText(t: string) {
    const s = sanitizeRepsInput(t);
    setRepsText(s);

    if (!s || s === "0") {
      props.onUpdateSetValue({
        exerciseIndex: index,
        setNumber,
        field: "reps",
        value: null,
      });
      return;
    }

    const n = Number(s);
    if (!Number.isFinite(n)) return;

    const safe = clampInt(n, 0, 300);
    props.onUpdateSetValue({
      exerciseIndex: index,
      setNumber,
      field: "reps",
      value: safe,
    });
  }

  function stepWeight(delta: number) {
    const cur = Number(weightText || 0) || 0;
    const next = Math.max(0, Math.round((cur + delta) * 10) / 10);
    commitWeightText(String(next));
  }

  function stepReps(delta: number) {
    const cur = Number(repsText || 0) || 0;
    const next = clampInt(cur + delta, 0, 300);
    commitRepsText(String(next));
  }

  function splitTimeSeconds(totalSeconds?: number | null) {
    if (totalSeconds == null || !Number.isFinite(totalSeconds)) {
      return { minutes: "", seconds: "" };
    }

    const safe = Math.max(0, Math.round(totalSeconds));
    return {
      minutes: String(Math.floor(safe / 60)),
      seconds: String(safe % 60),
    };
  }

  function commitTimeParts(nextMinutes: string, nextSeconds: string) {
    const cleanMinutes = nextMinutes.replace(/[^\d]/g, "");
    const cleanSeconds = nextSeconds.replace(/[^\d]/g, "");

    setMinutesText(cleanMinutes);
    setSecondsText(cleanSeconds);

    const minutes = cleanMinutes ? Number(cleanMinutes) : 0;
    const seconds = cleanSeconds ? Number(cleanSeconds) : 0;

    const safeSeconds = Math.max(0, Math.min(59, seconds));
    const total = minutes * 60 + safeSeconds;

    props.onUpdateSetValue({
      exerciseIndex: index,
      setNumber,
      field: "timeSeconds",
      value: total > 0 ? total : null,
    });
  }

  function commitMinutesText(t: string) {
    commitTimeParts(t, secondsText);
  }

  function commitSecondsText(t: string) {
    commitTimeParts(minutesText, t);
  }

  function commitDistanceText(t: string) {
    setDistanceText(t);
    const n = parseNullableNumber(t);
    props.onUpdateSetValue({
      exerciseIndex: index,
      setNumber,
      field: "distance",
      value: n,
    });
  }

  useEffect(() => {
    if (!props.visible || !exercise || !set) return;

    if (!cardio) {
      setWeightText(set.weight != null ? String(set.weight) : "");
      setRepsText(set.reps != null ? String(set.reps) : "");
    } else {
      setDistanceText(set.distance != null ? String(set.distance) : "");
      const parts = splitTimeSeconds(set.timeSeconds);
      setMinutesText(parts.minutes);
      setSecondsText(parts.seconds);
    }
  }, [props.visible, index, setNumber, cardio]);

  useEffect(() => {
    if (!exercise || !set) return;
    if (!ENABLE_AUTOFILL) return;
    if (!props.visible) return;

    if (hasSetData(exercise, set)) return;

    if (cardio) {
      const prev =
        exercise.sets.find(
          (s) => s.setNumber === setNumber - 1 && (s.dropIndex ?? 0) === 0,
        ) ?? null;
      const hist = pickLastSessionSet(exercise, setNumber);
      const src = prev && hasSetData(exercise, prev) ? prev : hist;
      if (!src) return;

      if (src.distance != null) commitDistanceText(String(src.distance));
      if (src.timeSeconds != null) {
        const parts = splitTimeSeconds(src.timeSeconds);
        commitTimeParts(parts.minutes, parts.seconds);
      }
      return;
    }

    const prev =
      exercise.sets.find(
        (s) => s.setNumber === setNumber - 1 && (s.dropIndex ?? 0) === 0,
      ) ?? null;
    const hist = pickLastSessionSet(exercise, setNumber);

    const prevCandidate =
      prev && hasSetData(exercise, prev)
        ? { weight: prev.weight ?? null, reps: prev.reps ?? null }
        : null;

    const histCandidate = hist
      ? { weight: hist.weight ?? null, reps: hist.reps ?? null }
      : null;

    const best = pickBestStrengthSource({
      prevSet: prevCandidate,
      lastSet: histCandidate,
    });
    if (!best) return;

    if (best.weight != null) commitWeightText(String(best.weight));
    if (best.reps != null) commitRepsText(String(best.reps));
  }, [ENABLE_AUTOFILL, props.visible, exercise, set, cardio, setNumber]);

  if (!exercise || !set) return null;

  const sheetRadius = 26;

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              props.onClose();
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.25)",
            }}
          />

          <View
            style={{
              backgroundColor: colors.bg,
              borderTopLeftRadius: sheetRadius,
              borderTopRightRadius: sheetRadius,
              overflow: "hidden",
              maxHeight: "92%",
            }}
          >
            <View
              style={{
                alignItems: "center",
                paddingTop: 10,
                paddingBottom: 10,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 99,
                  backgroundColor: colors.border,
                  opacity: 0.9,
                }}
              />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === "ios" ? "interactive" : "on-drag"
              }
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: insets.bottom + 14,
              }}
            >
              <ModalHeaderRow
                colors={colors}
                typography={typography}
                title={exercise.name}
                subtitle={`Set ${setNumber} of ${baseSetCount}`}
                onClose={props.onClose}
                canDropset={Boolean(loggingProfile?.canShowDropset)}
                dropsetEnabled={Boolean(exercise.prescription?.isDropset)}
                onToggleDropset={() => {
                  props.onToggleDropset?.(
                    index,
                    !Boolean(exercise.prescription?.isDropset),
                  );
                }}
                onSwapExercise={props.onSwapExercise}
              />

              {supersetGroup ? (
                <SupersetSwitcher
                  draft={props.draft}
                  activeExerciseIndex={index}
                  colors={colors}
                  typography={typography}
                  supersetGroup={supersetGroup}
                  onJumpToExercise={(exerciseIndex) => {
                    Keyboard.dismiss();
                    props.onJumpToExercise?.(exerciseIndex);
                  }}
                />
              ) : null}

              <TechniqueCues
                colors={colors}
                typography={typography}
                instructions={exercise.instructions}
              />

              {eligibleDropset ? (
                <DropsetToggleRow
                  colors={colors}
                  typography={typography}
                  enabled={dropMode}
                  onToggle={() => {
                    Keyboard.dismiss();
                    if (!dropMode) {
                      props.onInitDropSetForSet?.({
                        exerciseIndex: index,
                        setNumber,
                      });
                    } else {
                      props.onClearDropSetForSet?.({
                        exerciseIndex: index,
                        setNumber,
                      });
                    }
                  }}
                />
              ) : null}

              {loggingProfile?.canComputeVolume ||
              loggingProfile?.canComputeE1rm || targets.length > 0 ? (
                <StrengthStatsCards
                  colors={colors}
                  typography={typography}
                  targets={targets}
                  sets={exercise?.sets ?? []}
                  compareStrength={!!loggingProfile?.canComputeE1rm}
                  showVolume={!!loggingProfile?.canComputeVolume}
                  sessionVolume={sessionVolume}
                  bestNow={
                    bestNow
                      ? { weight: bestNow.weight, reps: bestNow.reps }
                      : null
                  }
                  volDelta={volDelta}
                  prDelta={prDelta}
                  bestE1rm6m={(exercise as any).bestE1rm6m ?? null}
                  bestSet6m={(exercise as any).bestSet6m ?? null}
                />
              ) : null}

              {strengthLike ? (
                <LastSessionSummary
                  colors={colors}
                  typography={typography}
                  lastCompletedAt={lastCompletedAt}
                  lastSessionSets={lastSessionSets as any}
                />
              ) : null}

              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                {cardio ? (
                  <CardioInputs
                    colors={colors}
                    typography={typography}
                    distanceText={distanceText}
                    minutesText={minutesText}
                    secondsText={secondsText}
                    onChangeDistance={commitDistanceText}
                    onChangeMinutes={commitMinutesText}
                    onChangeSeconds={commitSecondsText}
                  />
                ) : timed ? (
                  <TimedWeightInputs
                    colors={colors}
                    typography={typography}
                    weightText={weightText}
                    minutesText={minutesText}
                    secondsText={secondsText}
                    onChangeWeightText={(t) => commitWeightText(t)}
                    onChangeMinutes={commitMinutesText}
                    onChangeSeconds={commitSecondsText}
                    onStepWeight={(d) => stepWeight(d)}
                    weightRef={weightRef as any}
                  />
                ) : eligibleDropset && dropMode ? (
                  <View />
                ) : (
                  <StrengthInputs
                    colors={colors}
                    typography={typography}
                    weightText={
                      loggingProfile?.supportsWeight ? weightText : ""
                    }
                    repsText={repsText}
                    onChangeWeightText={(t) => commitWeightText(t)}
                    onChangeRepsText={(t) => commitRepsText(t)}
                    onStepWeight={(d) => stepWeight(d)}
                    onStepReps={(d) => stepReps(d)}
                    weightRef={weightRef as any}
                    repsRef={repsRef as any}
                    showWeight={Boolean(loggingProfile?.supportsWeight)}
                    weightLabel={
                      loggingProfile?.loggingType === "assisted"
                        ? "Assistance (kg)"
                        : "Weight (kg)"
                    }
                  />
                )}

                {eligibleDropset && dropMode ? (
                  <DropsetEditor
                    colors={colors}
                    typography={typography}
                    dropRows={dropRows.map((d) => ({
                      setNumber: d.setNumber,
                      dropIndex: d.dropIndex,
                      reps: d.reps,
                      weight: d.weight,
                    }))}
                    onUpdateDrop={(a) => {
                      props.onUpdateDropSetValue?.({
                        exerciseIndex: index,
                        setNumber,
                        dropIndex: a.dropIndex,
                        field: a.field,
                        value: a.value,
                      });
                    }}
                    onAddDrop={() => {
                      Keyboard.dismiss();
                      props.onAddDrop?.({ exerciseIndex: index, setNumber });
                    }}
                    canRemoveDrop={canRemoveDrop}
                    onRemoveDrop={() => {
                      Keyboard.dismiss();
                      props.onRemoveDrop?.({ exerciseIndex: index, setNumber });
                    }}
                  />
                ) : null}

                <BottomActions
                  colors={colors}
                  typography={typography}
                  canPrev={setNumber > 1}
                  primaryLabel={
                    lastIsCompleteButton ? "Complete" : "Next Set →"
                  }
                  primaryColor={
                    lastIsCompleteButton
                      ? (colors.success ?? "#22c55e")
                      : colors.primary
                  }
                  onPrev={() => {
                    Keyboard.dismiss();
                    props.onPrevSet();
                  }}
                  onPrimary={() => {
                    Keyboard.dismiss();
                    if (lastIsCompleteButton) props.onClose();
                    else props.onNextSet();
                  }}
                  canRemoveSet={
                    exercise.sets.filter((s) => (s.dropIndex ?? 0) === 0)
                      .length > 1
                  }
                  onRemoveSet={() => {
                    Keyboard.dismiss();
                    props.onRemoveSet(index);
                  }}
                  onAddSet={() => {
                    Keyboard.dismiss();
                    props.onAddSet(index);
                  }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
