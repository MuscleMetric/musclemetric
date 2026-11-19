// live/modals/sections/BottomActions.tsx
import React from "react";
import { View, Text, Pressable, Keyboard } from "react-native";

export function BottomActions(props: {
  colors: any;
  typography: any;
  canPrev: boolean;
  primaryLabel: string;
  primaryColor: string;
  onPrev: () => void;
  onPrimary: () => void;

  canRemoveSet: boolean;
  onRemoveSet: () => void;
  onAddSet: () => void;
}) {
  const { colors, typography } = props;

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18 }}>
        <Pressable
          onPress={props.onPrev}
          disabled={!props.canPrev}
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
            opacity: props.canPrev ? 1 : 0.35,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 22, fontFamily: typography.fontFamily.bold }}>
            ←
          </Text>
        </Pressable>

        <Pressable
          testID="set-confirm"
          onPress={() => {
            Keyboard.dismiss();
            props.onPrimary();
          }}
          style={{
            flex: 1,
            height: 56,
            borderRadius: 18,
            backgroundColor: props.primaryColor,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontFamily: typography.fontFamily.bold, fontSize: 18 }}>
            {props.primaryLabel}
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 14 }}>
        <Pressable
          onPress={props.onRemoveSet}
          disabled={!props.canRemoveSet}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: props.canRemoveSet ? 1 : 0.35,
          }}
        >
          <Text style={{ color: colors.text, fontFamily: typography.fontFamily.semibold }}>
            − Remove set
          </Text>
        </Pressable>

        <Pressable
          onPress={props.onAddSet}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, fontFamily: typography.fontFamily.semibold }}>
            + Add set
          </Text>
        </Pressable>
      </View>
    </>
  );
}
