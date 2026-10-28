import React from "react";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/lib/useAppTheme";

export function LiveStickyFooter(props: {
  disabled?: boolean;
  title: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: Math.max(16, insets.bottom + 10),
        backgroundColor: colors.bg,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <Pressable
        testID="workout-review"
        onPress={props.onPress}
        disabled={props.disabled}
        style={{
          height: 54,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: props.disabled ? colors.border : colors.primary,
          opacity: props.disabled ? 0.7 : 1,
        }}
      >
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
          {props.title}
        </Text>
      </Pressable>
    </View>
  );
}
