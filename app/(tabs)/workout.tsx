// app/(tabs)/workout.tsx
import React from "react";
import { Button } from "@/ui";
import { router } from "expo-router";
import { Platform, View } from "react-native";
import WorkoutsHome from "../features/workouts/screens/WorkoutsHome";

export default function WorkoutScreen() {
  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        maxWidth: 720,
        alignSelf: "center",
      }}
    >
      {Platform.OS === "ios" && <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
        <Button title="Outdoor Run" variant="outline" onPress={() => router.push("/features/cardio/outdoor-run")} />
      </View>}
      <WorkoutsHome />
    </View>
  );
}