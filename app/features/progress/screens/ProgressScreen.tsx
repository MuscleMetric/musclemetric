import React, { useMemo } from "react";
import { ScrollView, View, Platform, RefreshControl } from "react-native";
import { router } from "expo-router";
import { Button, Screen } from "@/ui";

import { useProgressOverview } from "../hooks/useProgressOverview";
import { mapOverview } from "../data/progress.mapper";

import ProgressSkeleton from "../components/ProgressSkeleton";
import ProgressErrorState from "../components/ProgressErrorState";

import MomentumHeroSection from "../sections/MomentumHeroSection";
import ConsistencySection from "../sections/ConsistencySection";
import StrengthHighlightsSection from "../sections/StrengthHighlightsSection";
import ExerciseSummarySection from "../sections/ExerciseSummarySection";
import RecentActivitySection from "../sections/RecentActivitySection";

import { NewUserProgressCard } from "@/app/features/home/ui/cards/NewUserProgressCard";

const UNLOCK_TARGET = 5;

export default function ProgressScreen() {
  const { data, loading, error, refresh } = useProgressOverview();

  const vm = useMemo(() => (data ? mapOverview(data) : null), [data]);

  const workoutsTotal = data?.meta?.workouts_total ?? 0;
  const isNewUser = workoutsTotal < UNLOCK_TARGET;

  if (loading) return <ProgressSkeleton />;

  const handleOpenDeepAnalytics = (exerciseId: string) => {
    router.push({
      pathname: "/features/progress/screens/deep-analytics",
      params: { exerciseId },
    });
  };

  return (
    <Screen>
      {error || !vm ? (
        <ProgressErrorState onRetry={refresh} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 24,
              gap: 12,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={refresh} />
            }
          >
            <MomentumHeroSection momentum={vm.momentum} />
            {Platform.OS === "ios" && <Button title="Running progress" variant="outline" onPress={() =>
              router.push({ pathname: "/features/cardio/outdoor-run", params: { view: "progress" } })} />}

            {isNewUser ? (
              <>
                <NewUserProgressCard
                  completed={workoutsTotal}
                  target={UNLOCK_TARGET}
                />

                <RecentActivitySection
                  recent={vm.recent}
                  onOpenHistory={() =>
                    router.push("/features/progress/screens/workoutHistory")
                  }
                  onOpenWorkoutHistoryDetail={(id) =>
                    router.push({
                      pathname: "/features/progress/screens/historyDetail",
                      params: { workoutHistoryId: id },
                    } as any)
                  }
                />
              </>
            ) : (
              <>
                <ConsistencySection consistency={vm.consistency} />

                <StrengthHighlightsSection
                  highlights={vm.highlights}
                  onOpenExercise={handleOpenDeepAnalytics}
                />

                <ExerciseSummarySection
                  exerciseSummary={vm.exerciseSummary}
                  onOpenExercise={handleOpenDeepAnalytics}
                />

                <RecentActivitySection
                  recent={vm.recent}
                  onOpenHistory={() =>
                    router.push("/features/progress/screens/workoutHistory")
                  }
                  onOpenWorkoutHistoryDetail={(id) =>
                    router.push({
                      pathname: "/features/progress/screens/historyDetail",
                      params: { workoutHistoryId: id },
                    } as any)
                  }
                />

                <View style={{ height: 8 }} />
              </>
            )}
          </ScrollView>
        </>
      )}
    </Screen>
  );
}
