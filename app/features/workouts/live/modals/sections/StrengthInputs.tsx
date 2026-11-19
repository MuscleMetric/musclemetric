// live/modals/sections/StrengthInputs.tsx
import React from "react";
import { View, Text, Pressable, TextInput, Platform } from "react-native";

export function StrengthInputs(props: {
  colors: any;
  typography: any;
  weightText: string;
  repsText: string;
  onChangeWeightText: (t: string) => void;
  onChangeRepsText: (t: string) => void;
  onStepWeight: (delta: number) => void;
  onStepReps: (delta: number) => void;
  weightRef: React.RefObject<TextInput>;
  repsRef: React.RefObject<TextInput>;
  showWeight?: boolean;
  weightLabel?: string;
}) {
  const { colors, typography } = props;
  const showWeight = props.showWeight ?? true;
  const weightLabel = props.weightLabel ?? "Weight (kg)";

  return (
    <>
      {showWeight ? (
        <>
          <Text
            style={{
              color: colors.textMuted,
              marginBottom: 8,
              fontSize: typography.size.sub,
            }}
          >
            {weightLabel}
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 22,
              backgroundColor: colors.surface ?? colors.bg,
              overflow: "hidden",
            }}
          >
            <Pressable
              onPress={() => props.onStepWeight(-2.5)}
              hitSlop={10}
              style={{
                width: 70,
                height: 64,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 28,
                  color: colors.text,
                  fontFamily: typography.fontFamily.bold,
                }}
              >
                −
              </Text>
            </Pressable>

            <View
              style={{
                flex: 1,
                height: 64,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TextInput
                testID="set-weight"
                ref={props.weightRef}
                value={props.weightText}
                onChangeText={props.onChangeWeightText}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                inputMode="decimal"
                style={{
                  fontFamily: typography.fontFamily.bold,
                  fontSize: 34,
                  color: colors.text,
                  textAlign: "center",
                  width: "100%",
                  paddingVertical: 0,
                }}
              />
              <Text
                style={{
                  color: colors.textMuted,
                  marginTop: -4,
                  fontSize: typography.size.sub,
                }}
              >
                kilograms
              </Text>
            </View>

            <Pressable
              onPress={() => props.onStepWeight(+2.5)}
              hitSlop={10}
              style={{
                width: 70,
                height: 64,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 28,
                  color: colors.text,
                  fontFamily: typography.fontFamily.bold,
                }}
              >
                +
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <Text
        style={{
          color: colors.textMuted,
          marginBottom: 8,
          marginTop: showWeight ? 14 : 0,
          fontSize: typography.size.sub,
        }}
      >
        Reps
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 22,
          backgroundColor: colors.surface ?? colors.bg,
          overflow: "hidden",
        }}
      >
        <Pressable
          onPress={() => props.onStepReps(-1)}
          hitSlop={10}
          style={{
            width: 70,
            height: 64,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 28,
              color: colors.text,
              fontFamily: typography.fontFamily.bold,
            }}
          >
            −
          </Text>
        </Pressable>

        <View
          style={{
            flex: 1,
            height: 64,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <TextInput
            testID="set-reps"
            ref={props.repsRef}
            value={props.repsText}
            onChangeText={props.onChangeRepsText}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={{
              fontFamily: typography.fontFamily.bold,
              fontSize: 34,
              color: colors.text,
              textAlign: "center",
              width: "100%",
              paddingVertical: 0,
            }}
          />
          <Text
            style={{
              color: colors.textMuted,
              marginTop: -4,
              fontSize: typography.size.sub,
            }}
          >
            repetitions
          </Text>
        </View>

        <Pressable
          onPress={() => props.onStepReps(+1)}
          hitSlop={10}
          style={{
            width: 70,
            height: 64,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 28,
              color: colors.text,
              fontFamily: typography.fontFamily.bold,
            }}
          >
            +
          </Text>
        </Pressable>
      </View>
    </>
  );
}