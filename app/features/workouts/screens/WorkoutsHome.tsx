import React, { useCallback, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  View,
} from "react-native";
import { router } from "expo-router";

import { useAuth } from "@/lib/authContext";
import { useAppTheme } from "@/lib/useAppTheme";
import { Screen, LoadingScreen, ErrorState, AuthRequiredState } from "@/ui";

import { useWorkoutsTab } from "../data/useWorkoutsTab";
import type { WorkoutsTabPayload } from "../types/workoutsTab";

import { CreateWorkoutModal } from "../components/CreateWorkoutModal";

import { NewUserSetupSection } from "../sections/NewUserSetupSection";
import { SuggestedSection } from "../sections/SuggestedSection";
import { MyWorkoutsSection } from "../sections/MyWorkoutsSection";
import { ActivePlanHeroSection } from "../sections/ActivePlanHeroSection";
import { PlanScheduleSection } from "../sections/PlanScheduleSection";
import { OptionalSessionsSection } from "../sections/OptionalSessionsSection";
import { NoPlanCtaSection } from "../sections/NoPlanCtaSection";

const ROUTES = {
  workoutPreview: "/features/workouts/screens/WorkoutOverview",
  workoutUse: "/features/workouts/screens/WorkoutOverview",
  planView: "/features/plans/history/view",
  planEdit: "/features/plans/edit",
  planCreate: "/features/plans/create/planInfo",
} as const;

import { log } from "@/lib/logger";

type ActivePlansEntry = NonNullable<WorkoutsTabPayload["activePlans"]>[number];

export default function WorkoutsHome() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const { colors, layout } = useAppTheme();

  const { loading, error, data, refetch } = useWorkoutsTab(userId);
  const [createOpen, setCreateOpen] = useState(false);

  if (!userId) return <AuthRequiredState />;
  if (loading) return <LoadingScreen />;
  if (error || !data) {
    return (
      <ErrorState
        title="Workouts couldn’t load"
        message="Check your internet connection, then try again. Your saved workouts haven’t been changed."
        onRetry={refetch}
      />
    );
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{
          padding: layout.space.lg,
          gap: layout.space.md,
          paddingBottom: layout.space.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <StateRenderer
          payload={data}
          userId={userId}
          onOpenCreate={() => setCreateOpen(true)}
        />
      </ScrollView>

      <CreateWorkoutModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </Screen>
  );
}

function StateRenderer({
  payload,
  userId,
  onOpenCreate,
}: {
  payload: WorkoutsTabPayload;
  userId: string | null;
  onOpenCreate: () => void;
}) {
  const { layout } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();

  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);

  const heroListRef = useRef<FlatList<ActivePlansEntry>>(null);
  const scheduleListRef = useRef<FlatList<ActivePlansEntry>>(null);
  const selectedPlanIndexRef = useRef(0);

  if (payload.state === "new_user") {
    return (
      <>
        <NewUserSetupSection
          setup={payload.setup ?? null}
          onOpenCreate={onOpenCreate}
        />

        <NoPlanCtaSection
          workoutsTotal={payload.workoutsTotal ?? 0}
          onPress={() => router.push(ROUTES.planCreate)}
        />

        <SuggestedSection
          suggested={payload.suggested ?? null}
          onPressWorkout={(workoutId) =>
            router.push({
              pathname: ROUTES.workoutPreview,
              params: { workoutId },
            })
          }
        />

        <MyWorkoutsSection
          mode="new_user"
          myWorkouts={payload.myWorkouts}
          onOpenCreate={onOpenCreate}
          onExplorePlans={() => router.push(ROUTES.planCreate)}
          onPressWorkout={(workoutId) =>
            router.push({
              pathname: ROUTES.workoutUse,
              params: { workoutId },
            })
          }
        />
      </>
    );
  }

  if (payload.state === "no_plan") {
    return (
      <>
        <NoPlanCtaSection
          workoutsTotal={payload.workoutsTotal ?? 0}
          onPress={() => router.push(ROUTES.planCreate)}
        />

        <MyWorkoutsSection
          mode="no_plan"
          myWorkouts={payload.myWorkouts}
          onOpenCreate={onOpenCreate}
          onExplorePlans={() => router.push(ROUTES.planCreate)}
          onPressWorkout={(workoutId) =>
            router.push({
              pathname: ROUTES.workoutUse,
              params: { workoutId },
            })
          }
        />
      </>
    );
  }

  const activePlans = payload.activePlans ?? [];
  if (activePlans.length === 0) return null;

  const safeSelectedIndex = Math.min(
    selectedPlanIndex,
    Math.max(activePlans.length - 1, 0),
  );

  const selectedEntry = activePlans[safeSelectedIndex] ?? null;
  if (!selectedEntry?.activePlan) return null;

  const selectedActivePlan = selectedEntry.activePlan;

  const cardWidth = windowWidth - layout.space.lg * 2;

  const syncToIndex = (
    nextIndex: number,
    source: "hero" | "schedule",
  ): void => {
    if (nextIndex < 0 || nextIndex >= activePlans.length) return;
    if (selectedPlanIndexRef.current === nextIndex) return;

    selectedPlanIndexRef.current = nextIndex;
    setSelectedPlanIndex(nextIndex);

    if (source === "hero") {
      scheduleListRef.current?.scrollToIndex({
        index: nextIndex,
        animated: true,
      });
    } else {
      heroListRef.current?.scrollToIndex({
        index: nextIndex,
        animated: true,
      });
    }
  };

  const getIndexFromOffset = (x: number) => {
    if (cardWidth <= 0) return 0;
    return Math.round(x / cardWidth);
  };

  const handleHeroMomentumEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = getIndexFromOffset(e.nativeEvent.contentOffset.x);
    syncToIndex(nextIndex, "hero");
  };

  const handleScheduleMomentumEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = getIndexFromOffset(e.nativeEvent.contentOffset.x);
    syncToIndex(nextIndex, "schedule");
  };

  const handleOpenPlanCreate = () => {
    router.push(ROUTES.planCreate);
  };

  return (
    <>
      <FlatList
        ref={heroListRef}
        data={activePlans}
        horizontal
        pagingEnabled
        scrollEnabled={activePlans.length > 1}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.activePlan.planId}
        onMomentumScrollEnd={handleHeroMomentumEnd}
        getItemLayout={(_, index) => ({
          length: cardWidth,
          offset: cardWidth * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <ActivePlanHeroSection
              userId={userId}
              activePlan={item.activePlan}
              onStartNext={({ workoutId, planWorkoutId }) =>
                router.push({
                  pathname: ROUTES.workoutPreview,
                  params: { workoutId, planWorkoutId },
                })
              }
            />
          </View>
        )}
      />

      <FlatList
        ref={scheduleListRef}
        data={activePlans}
        horizontal
        pagingEnabled
        scrollEnabled={activePlans.length > 1}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => `${item.activePlan.planId}-schedule`}
        onMomentumScrollEnd={handleScheduleMomentumEnd}
        getItemLayout={(_, index) => ({
          length: cardWidth,
          offset: cardWidth * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            {item.planSchedule ? (
              <PlanScheduleSection
                schedule={item.planSchedule}
                onPressWorkout={({ workoutId, planWorkoutId }) =>
                  router.push({
                    pathname: ROUTES.workoutPreview,
                    params: { workoutId, planWorkoutId },
                  })
                }
                onViewAll={() =>
                  router.push({
                    pathname: ROUTES.planView,
                    params: { planId: item.activePlan.planId },
                  })
                }
                onEdit={() =>
                  router.push({
                    pathname: ROUTES.planEdit,
                    params: { planId: item.activePlan.planId },
                  })
                }
                showCreate={true}
                onCreate={handleOpenPlanCreate}
              />
            ) : null}
          </View>
        )}
      />

      {payload.optionalSessions ? (
        <OptionalSessionsSection
          optional={payload.optionalSessions}
          onOpenCreate={onOpenCreate}
          onQuickStart={() =>
            router.push({
              pathname: "/features/workouts/live",
            })
          }
          onPressWorkout={(workoutId) =>
            router.push({ pathname: ROUTES.workoutUse, params: { workoutId } })
          }
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({});
