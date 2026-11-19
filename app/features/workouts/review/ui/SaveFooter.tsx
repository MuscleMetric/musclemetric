// app/features/workouts/live/review/ui/SaveFooter.tsx
import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/lib/useAppTheme";

export function SaveFooter(props: {
  saving: boolean;
  disabled?: boolean;
  onPressSave: () => void;
  hint?: string;
}) {
  const { colors, typography } = useAppTheme();
  const insets = useSafeAreaInsets();

  const disabled = Boolean(props.disabled) || props.saving;

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: insets.bottom + 14,
        backgroundColor: colors.bg,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <Pressable
        disabled={disabled}
        testID="workout-save"
        onPress={props.onPressSave}
        style={{
          height: 56,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: disabled ? colors.border : colors.primary,
          opacity: disabled ? 0.7 : 1,
          flexDirection: "row",
          gap: 10,
        }}
      >
        {props.saving ? <ActivityIndicator /> : null}
        <Text style={{ color: "#fff", fontFamily: typography.fontFamily.bold, fontSize: 16 }}>
          Save Workout ✓
        </Text>
      </Pressable>

      <Text
        style={{
          marginTop: 8,
          textAlign: "center",
          color: colors.textMuted,
          fontFamily: typography.fontFamily.medium,
          fontSize: 12,
        }}
      >
        {props.hint ?? "This will save your workout and close the session."}
      </Text>
    </View>
  );
}
