// app/features/plans/create/PlanInfo.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../../../../lib/supabase";
import { useExercisesCache, CachedExercise } from "./exercisesStore";
import { usePlanDraft } from "./store";
import { useAppTheme } from "../../../../lib/useAppTheme";

/* ---------------- helpers ---------------- */

async function fetchAllExercises(): Promise<CachedExercise[]> {
  const pageSize = 500;
  let from = 0;
  const out: CachedExercise[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("v_exercises_compact")
      .select("id,name,type,primary_muscle,popularity")
      .order("popularity", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const chunk = (data ?? []) as CachedExercise[];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function startOfTodayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseYmdLocal(ymd: string) {
  const [y, m, day] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

function formatYmdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addWeeksLocal(base: Date, weeks: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function weeksBetweenCeil(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  const days = ms / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.ceil(days / 7));
}

function formatEndLabel(d: Date) {
  // e.g. "Ends Apr 12"
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `Ends ${months[d.getMonth()]} ${d.getDate()}`;
}

/* ---------------- screen ---------------- */

type LengthMode = "weeks" | "date";

export default function PlanInfo() {
  const { colors, typography, layout } = useAppTheme();
  const s = useMemo(() => makeStyles(colors, typography, layout), [colors, typography, layout]);

  const { reset, title, endDate, workoutsPerWeek, setMeta, initWorkouts } = usePlanDraft();

  // NOTE: Keeping your prior behaviour (reset on focus) since you asked not to change functionality.
  // If you want "Back" from step 2 to preserve inputs, remove this reset and only reset on entry.
  useFocusEffect(
    useCallback(() => {
      reset();
    }, [reset])
  );

  // Exercise cache warm-up (kept to preserve your existing behavior)
  const { items, setItems } = useExercisesCache();
  const [loadingExercises, setLoadingExercises] = useState(false);

  useEffect(() => {
    if (items.length > 0) return;
    (async () => {
      setLoadingExercises(true);
      try {
        const list = await fetchAllExercises();
        setItems(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingExercises(false);
      }
    })();
  }, [items.length, setItems]);

  // Length selection (toggle weeks vs end date)
  const start = useMemo(() => startOfTodayLocal(), []);
  const end = endDate ? parseYmdLocal(endDate) : null;

  const [lengthMode, setLengthMode] = useState<LengthMode>("weeks");
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => end ?? addWeeksLocal(start, 8));

  const computedWeeks = useMemo(() => {
    if (!end) return 8;
    return weeksBetweenCeil(start, end);
  }, [endDate]);

  const [weeks, setWeeks] = useState<number>(() => computedWeeks || 8);

  // keep local weeks in sync if endDate changes (e.g. user picked a date)
  useEffect(() => {
    if (!end) return;
    const w = weeksBetweenCeil(start, end);
    setWeeks(w);
  }, [endDate]);

  // Ensure an endDate exists when using weeks mode (so proceed() works)
  useEffect(() => {
    if (endDate) return;
    // default to 8 weeks on first render
    const d = addWeeksLocal(start, 8);
    setMeta({ endDate: formatYmdLocal(d) });
    setTempDate(d);
    setWeeks(8);
  }, [endDate, setMeta, start]);

  const MIN_WEEKS = 1;
  const MAX_WEEKS = 52;

  function commitWeeks(nextWeeks: number) {
    const w = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, nextWeeks));
    setWeeks(w);
    const d = addWeeksLocal(start, w);
    setMeta({ endDate: formatYmdLocal(d) });
    setTempDate(d);
  }

  const planNameValid = title.trim().length > 0;
  const endValid = !!endDate;
  const daysValid = workoutsPerWeek >= 1 && workoutsPerWeek <= 7;

  const canContinue = planNameValid && endValid && daysValid && !loadingExercises;

  function proceed() {
    if (!planNameValid) return Alert.alert("Please add a plan name");
    if (!endDate) return Alert.alert("Please choose an end date");
    if (!daysValid) return Alert.alert("Days per week must be between 1 and 7");
    initWorkouts(workoutsPerWeek);
    router.push({
      pathname: "/features/plans/create/workout",
      params: { index: 0 },
    });
  }

  const summaryText = useMemo(() => {
    const days = `${workoutsPerWeek} day${workoutsPerWeek === 1 ? "" : "s"}/week`;
    const w = `${computedWeeks} week${computedWeeks === 1 ? "" : "s"}`;
    const ends = end ? formatEndLabel(end) : "End date not set";
    return `${days} • ${w} • ${ends}`;
  }, [workoutsPerWeek, computedWeeks, endDate]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={layout.hitSlop} style={s.headerIconBtn}>
            <Text style={s.headerIcon}>‹</Text>
          </Pressable>

          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Step 1: Plan Info</Text>
          </View>
        </View>

        {/* Progress */}
        <View style={s.progressWrap}>
          <View style={s.progressBarTrack}>
            <View style={[s.progressBarFill, { width: "25%" }]} />
          </View>
          <Text style={s.progressMeta}>Step 1 of 4</Text>
        </View>

        {/* Content */}
        <View style={s.content}>
          {/* Plan name */}
          <Text style={s.sectionLabel}>Plan Name</Text>
          <View style={[s.inputWrap, planNameValid && s.inputWrapValid]}>
            <TextInput
              value={title}
              onChangeText={(t) => setMeta({ title: t })}
              testID="plan-title"
              placeholder="Hypertrophy Peak Phase"
              placeholderTextColor={colors.textMuted}
              style={s.input}
              returnKeyType="done"
            />
            {planNameValid ? (
              <View style={s.validBadge}>
                <Text style={s.validBadgeText}>✓</Text>
              </View>
            ) : null}
          </View>

          {/* Days per week */}
          <Text style={[s.sectionLabel, { marginTop: layout.space.lg }]}>Days per week</Text>
          <View style={s.daysRow}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => {
              const active = workoutsPerWeek === n;
              return (
                <Pressable
                  key={n}
                  testID={`plan-days-${n}`}
                  onPress={() => setMeta({ workoutsPerWeek: n })}
                  style={[s.dayPill, active && s.dayPillActive]}
                >
                  <Text style={[s.dayPillText, active && s.dayPillTextActive]}>{n}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Plan length */}
          <Text style={[s.sectionLabel, { marginTop: layout.space.lg }]}>Plan Length</Text>

          {/* Toggle */}
          <View style={s.segment}>
            <Pressable
              onPress={() => setLengthMode("weeks")}
              style={[s.segmentBtn, lengthMode === "weeks" && s.segmentBtnActive]}
            >
              <Text style={[s.segmentText, lengthMode === "weeks" && s.segmentTextActive]}>
                Weeks
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setLengthMode("date")}
              style={[s.segmentBtn, lengthMode === "date" && s.segmentBtnActive]}
            >
              <Text style={[s.segmentText, lengthMode === "date" && s.segmentTextActive]}>
                End date
              </Text>
            </Pressable>
          </View>

          {lengthMode === "weeks" ? (
            <View style={s.stepper}>
              <Text style={s.stepperNumber}>{weeks}</Text>
              <Text style={s.stepperUnit}>weeks</Text>

              <View style={{ flex: 1 }} />

              <Pressable
                onPress={() => commitWeeks(weeks - 1)}
                style={s.stepperBtn}
                hitSlop={layout.hitSlop}
              >
                <Text style={s.stepperBtnText}>–</Text>
              </Pressable>

              <Pressable
                onPress={() => commitWeeks(weeks + 1)}
                style={s.stepperBtn}
                hitSlop={layout.hitSlop}
              >
                <Text style={s.stepperBtnText}>+</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setTempDate(end ?? addWeeksLocal(start, weeks));
                setShowDateModal(true);
              }}
              style={s.dateSelect}
            >
              <Text style={s.dateSelectText}>
                {end ? end.toDateString() : "Select end date"}
              </Text>
              <Text style={s.chevron}>›</Text>
            </Pressable>
          )}

          {/* (Optional) warm-up indicator kept from previous behavior */}
          {loadingExercises ? (
            <View style={s.loadingRow}>
              <ActivityIndicator />
              <Text style={s.loadingText}>Loading exercise library…</Text>
            </View>
          ) : null}
        </View>

        {/* Bottom pinned summary + CTA */}
        <View style={s.bottomDock}>
          <View style={s.summaryChip}>
            <Text style={s.summaryChipText}>{summaryText}</Text>
          </View>

          <Pressable
            onPress={proceed}
            disabled={!canContinue}
            style={[s.cta, !canContinue && s.ctaDisabled]}
          >
            <Text style={s.ctaText}>Continue</Text>
          </Pressable>
        </View>

        {/* Date picker modal */}
        <Modal
          visible={showDateModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDateModal(false)}
        >
          <View style={s.modalScrim}>
            <View style={s.modalCard}>
              <View style={{ marginBottom: layout.space.sm }}>
                <Text style={s.modalTitle}>Select end date</Text>
                <Text style={s.modalSub}>Pick when this plan finishes (you can change it later).</Text>
              </View>

              <DateTimePicker
                value={tempDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={(_, d) => d && setTempDate(d)}
              />

              <View style={s.modalActions}>
                <Pressable style={[s.modalBtn]} onPress={() => setShowDateModal(false)}>
                  <Text style={s.modalBtnText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[s.modalBtn, s.modalBtnPrimary]}
                  onPress={() => {
                    const ymd = formatYmdLocal(tempDate);
                    setMeta({ endDate: ymd });

                    const w = weeksBetweenCeil(start, tempDate);
                    setWeeks(w);
                    setLengthMode("date");

                    setShowDateModal(false);
                  }}
                >
                  <Text style={s.modalBtnPrimaryText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */

const makeStyles = (colors: any, typography: any, layout: any) =>
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: colors.bg,
    },

    header: {
      paddingHorizontal: layout.space.lg,
      paddingTop: layout.space.sm,
      paddingBottom: layout.space.sm,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerIconBtn: {
      width: 44,
      height: 44,
      borderRadius: layout.radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    headerIcon: {
      color: colors.primary,
      fontSize: 26,
      fontFamily: typography.fontFamily.bold,
      marginTop: -2,
    },
    headerCenter: {
      flex: 1,
      alignItems: "center",
    },
    headerTitle: {
      color: colors.text,
      fontSize: typography.size.sub,
      fontFamily: typography.fontFamily.semibold,
      letterSpacing: 0.2,
    },
    headerTextBtn: {
      height: 44,
      alignItems: "flex-end",
      justifyContent: "center",
      paddingHorizontal: layout.space.sm,
    },
    headerTextBtnText: {
      color: colors.primary,
      fontSize: typography.size.meta,
      fontFamily: typography.fontFamily.semibold,
    },

    progressWrap: {
      paddingHorizontal: layout.space.lg,
      paddingBottom: layout.space.sm,
    },
    progressBarTrack: {
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.trackBg,
      overflow: "hidden",
    },
    progressBarFill: {
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    progressMeta: {
      marginTop: layout.space.xs,
      color: colors.textMuted,
      fontSize: typography.size.meta,
      fontFamily: typography.fontFamily.medium,
      textAlign: "right",
    },

    content: {
      flex: 1,
      paddingHorizontal: layout.space.lg,
      paddingTop: layout.space.md,
    },

    sectionLabel: {
      color: colors.text,
      fontSize: typography.size.sub,
      fontFamily: typography.fontFamily.semibold,
      marginBottom: layout.space.sm,
    },

    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: layout.radius.xl,
      paddingHorizontal: layout.space.md,
      height: 54,
    },
    inputWrapValid: {
      borderColor: colors.primary,
    },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: typography.size.body,
      fontFamily: typography.fontFamily.medium,
    },
    validBadge: {
      width: 22,
      height: 22,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: layout.space.sm,
    },
    validBadgeText: {
      color: colors.onPrimary,
      fontSize: 14,
      fontFamily: typography.fontFamily.bold,
      marginTop: -1,
    },

    daysRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 8,
    },
    dayPill: {
      width: 40,
      height: 40,
      borderRadius: layout.radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    dayPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    dayPillText: {
      color: colors.textMuted,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.sub,
    },
    dayPillTextActive: {
      color: colors.onPrimary,
    },

    segment: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: layout.radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      marginBottom: layout.space.md,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentBtnActive: {
      backgroundColor: colors.cardPressed,
    },
    segmentText: {
      color: colors.textMuted,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.meta,
    },
    segmentTextActive: {
      color: colors.primary,
    },

    stepper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: layout.radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: layout.space.md,
      height: 56,
    },
    stepperNumber: {
      color: colors.text,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.h2,
      marginRight: 6,
    },
    stepperUnit: {
      color: colors.textMuted,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sub,
    },
    stepperBtn: {
      width: 40,
      height: 40,
      borderRadius: layout.radius.pill,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 10,
    },
    stepperBtnText: {
      color: colors.primary,
      fontFamily: typography.fontFamily.bold,
      fontSize: 20,
      marginTop: -1,
    },

    dateSelect: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: layout.radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: layout.space.md,
      height: 56,
    },
    dateSelectText: {
      flex: 1,
      color: colors.text,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sub,
    },
    chevron: {
      color: colors.textMuted,
      fontFamily: typography.fontFamily.bold,
      fontSize: 22,
      marginLeft: 10,
      marginTop: -2,
    },

    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: layout.space.md,
    },
    loadingText: {
      color: colors.textMuted,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.meta,
    },

    bottomDock: {
      paddingHorizontal: layout.space.lg,
      paddingBottom: layout.space.lg,
      paddingTop: layout.space.sm,
      backgroundColor: colors.bg,
    },
    summaryChip: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderRadius: layout.radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: layout.space.md,
    },
    summaryChipText: {
      color: colors.primary,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.meta,
      textAlign: "center",
    },

    cta: {
      height: 56,
      borderRadius: layout.radius.xl,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    ctaDisabled: {
      opacity: 0.45,
    },
    ctaText: {
      color: colors.onPrimary,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.body,
    },

    modalScrim: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: layout.radius.xl,
      borderTopRightRadius: layout.radius.xl,
      padding: layout.space.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    modalTitle: {
      color: colors.text,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.h3,
    },
    modalSub: {
      marginTop: 4,
      color: colors.textMuted,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.meta,
    },
    modalActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: layout.space.md,
    },
    modalBtn: {
      flex: 1,
      height: 48,
      borderRadius: layout.radius.lg,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    modalBtnText: {
      color: colors.text,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.sub,
    },
    modalBtnPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    modalBtnPrimaryText: {
      color: colors.onPrimary,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.sub,
    },
  });
