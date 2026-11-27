// app/(tabs)/workout.tsx
import React, { useCallback, useState } from "react";
import { Button } from "@/ui";
import { router, useFocusEffect } from "expo-router";
import { Platform, View } from "react-native";
import { useAuth } from "@/lib/authContext";
import { listRuns } from "@/features/cardio/runStore";
import WorkoutsHome from "../features/workouts/screens/WorkoutsHome";

export default function WorkoutScreen() {
  const { userId } = useAuth();
  const [legacyOwner, setLegacyOwner] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (Platform.OS === "ios" && userId) {
      void listRuns(userId).then(runs => {
        if (active) setLegacyOwner(runs.some(run => !run.workoutSet && run.end === null) ? userId : null);
      }).catch(() => { if (active) setLegacyOwner(null); });
    }
    return () => { active = false; };
  }, [userId]));
  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        maxWidth: 720,
        alignSelf: "center",
      }}
    >
      {userId && legacyOwner === userId && <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
        <Button title="Resume outdoor run" variant="outline" onPress={() => router.push("/features/cardio/outdoor-run")} />
      </View>}
      <WorkoutsHome />
    </View>
  );
}