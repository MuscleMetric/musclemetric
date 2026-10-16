import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { supabase } from "@/lib/supabase";
import { Screen, ScreenHeader, LoadingScreen, ErrorState, Icon } from "@/ui";
import { useAppTheme } from "@/lib/useAppTheme";

import type { DeepAnalyticsPayload } from "../deep-analytics/types";
import { generatePrimaryInsight } from "../deep-analytics/utils/deepAnalyticsInsights";
import { CardioAnalyticsView } from "../deep-analytics/components/CardioAnalyticsView";

import {
  DeepAnalyticsHeader,
  DeepAnalyticsStatCards,
  DeepAnalyticsInsightCard,
  DeepAnalyticsFormulaCard,
  StrengthOverTimeSection,
  VolumeTrendSection,
  WeightVsRepsSection,
  SetContributionSection,
} from "../deep-analytics/components";

export default function DeepAnalytics({
  exerciseId: exerciseIdProp,
}: {
  exerciseId?: string;
}) {
  const { colors } = useAppTheme();

  const params = useLocalSearchParams<{ exerciseId?: string }>();

  const exerciseId = useMemo(
    () => (exerciseIdProp ?? params.exerciseId ?? "").toString(),
    [exerciseIdProp, params.exerciseId],
  );

  const [payload, setPayload] = useState<DeepAnalyticsPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const normalizePayload = useCallback((raw: any): DeepAnalyticsPayload => {
    return {
      ...raw,
      charts: {
        volume_trend: raw?.charts?.volume_trend ?? [],
        weight_vs_reps: raw?.charts?.weight_vs_reps ?? [],
        set_contribution: raw?.charts?.set_contribution ?? [],

        // Supports both the old backend key and the new frontend type.
        progress_over_time:
          raw?.charts?.progress_over_time ??
          raw?.charts?.strength_over_time ??
          [],
      },
    };
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!exerciseId) {
        setErrorMessage("Missing exerciseId");
        setPayload(null);
        setLoading(false);
        return;
      }

      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      setErrorMessage(null);

      const { data, error } = await supabase.rpc(
        "get_exercise_deep_analytics",
        {
          p_exercise_id: exerciseId,
        },
      );

      if (error) {
        setErrorMessage(error.message);
        setPayload(null);
      } else {
        setPayload(normalizePayload(data));
      }

      setLoading(false);
      setRefreshing(false);
    },
    [exerciseId, normalizePayload],
  );

  useEffect(() => {
    load("initial");
  }, [load]);

  if (loading) return <LoadingScreen />;

  if (errorMessage) {
    return (
      <ErrorState title="Deep analytics failed" message={errorMessage} />
    );
  }

  if (!payload) {
    return <ErrorState title="No data" message="Try another exercise." />;
  }

  const insight = generatePrimaryInsight(payload);

  return (
    <Screen>
      <ScreenHeader
        title="Deep analytics"
        right={
          <Icon name="stats-chart-outline" size={20} color={colors.textMuted} />
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load("refresh")}
          />
        }
      >
        {payload.meta.exercise_type === 'cardio' ? (
          <CardioAnalyticsView name={payload.meta.exercise_name} data={payload.cardio} timezone={payload.meta.timezone} />
        ) : <>
        <DeepAnalyticsHeader payload={payload} />

        <DeepAnalyticsStatCards payload={payload} />

        <DeepAnalyticsInsightCard insight={insight} />

        <DeepAnalyticsFormulaCard />

        <StrengthOverTimeSection payload={payload} />

        <VolumeTrendSection payload={payload} />

        <WeightVsRepsSection payload={payload} />

        <SetContributionSection payload={payload} />
        </>}
      </ScrollView>
    </Screen>
  );
}
