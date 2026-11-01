// app/features/workouts/components/CreateWorkoutModal.tsx

import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAppTheme } from "@/lib/useAppTheme";
import { Button } from "@/ui";

export function CreateWorkoutModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors, layout } = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* backdrop */}
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      >
        {/* sheet */}
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.lg,
              padding: layout.space.md,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ gap: layout.space.sm }}>
            <Button
              title="Quick start workout"
              onPress={() => {
                onClose();
                router.push("/features/workouts/live");
              }}
            />

            <Button
              title="Build my own workout"
              onPress={() => {
                onClose();
                router.push("/features/workouts/create");
              }}
              variant="secondary"
            />

            <Button
              title="Cancel"
              onPress={onClose}
              variant="ghost"
              fullWidth
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
  },
});
