import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEvent } from "expo";
import { VideoView, useVideoPlayer } from "expo-video";
import { Pause, Play, RotateCcw, X } from "lucide-react-native";
import { useAppTheme } from "@/lib/useAppTheme";
import type { VitalPreviewAnimation } from "./types";
import { findExerciseDemo } from "./catalog";
import { DemoThumbnail } from "./DemoThumbnail";

function DemoPlayer({ clip }: { clip: VitalPreviewAnimation }) {
  const { colors } = useAppTheme();
  const [speed, setSpeed] = useState(1);
  const [loadFailed, setLoadFailed] = useState(false);
  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = "mixWithOthers";
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const reduced = await AccessibilityInfo.isReduceMotionEnabled();
        if (!active) return;
        await player.replaceAsync(clip.source);
        if (active && !reduced && AppState.currentState === "active")
          player.play();
      } catch {
        if (active) setLoadFailed(true);
      }
    }
    void load();
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (reduced) => {
        if (reduced) player.pause();
      },
    );
    return () => {
      active = false;
      app.remove();
      motion.remove();
    };
  }, [clip.source, player]);
  const failed = loadFailed || status === "error";
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          overflow: "hidden",
          aspectRatio: 1,
          width: "100%",
          maxHeight: 340,
        }}
      >
        <VideoView
          player={player}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture={false}
          style={{ width: "100%", height: "100%" }}
        />
        {status === "loading" && !failed ? (
          <ActivityIndicator
            style={{ position: "absolute", alignSelf: "center", top: "45%" }}
            color="#2563EB"
          />
        ) : null}
        {failed ? (
          <View
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#FFFFFF",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <Text style={{ color: "#475569", textAlign: "center" }}>
              Demo unavailable. You can still read the steps below and return to
              your workout.
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isPlaying ? "Pause demonstration" : "Play demonstration"
          }
          disabled={failed}
          onPress={() => (isPlaying ? player.pause() : player.play())}
          style={{
            minHeight: 44,
            minWidth: 44,
            borderRadius: 22,
            backgroundColor: colors.trackBg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isPlaying ? (
            <Pause size={20} color={colors.primary} />
          ) : (
            <Play size={20} color={colors.primary} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Replay demonstration"
          disabled={failed}
          onPress={() => {
            player.currentTime = 0;
            player.play();
          }}
          style={{
            minHeight: 44,
            minWidth: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <RotateCcw size={20} color={colors.primary} />
        </Pressable>
        <Text style={{ flex: 1, color: colors.textMuted, fontSize: 12 }}>
          Silent loop
        </Text>
        {[0.5, 1].map((rate) => (
          <Pressable
            key={rate}
            accessibilityRole="button"
            accessibilityLabel={`Playback speed ${rate}`}
            accessibilityState={{ selected: speed === rate }}
            onPress={() => {
              player.playbackRate = rate;
              setSpeed(rate);
            }}
            style={{
              minWidth: 48,
              minHeight: 44,
              borderRadius: 22,
              backgroundColor: speed === rate ? colors.primary : colors.trackBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: speed === rate ? "#FFFFFF" : colors.text }}>
              {rate}×
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ExerciseDemoSheet({
  clip,
  title,
  onClose,
}: {
  clip: VitalPreviewAnimation;
  title: string;
  onClose: () => void;
}) {
  const { colors, typography } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close demonstration"
          onPress={onClose}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: colors.overlay,
          }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "92%",
            backgroundColor: colors.surface,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 4,
              backgroundColor: colors.border,
              alignSelf: "center",
              marginTop: 10,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 18,
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 5 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 20,
                  fontFamily: typography.fontFamily.bold,
                }}
              >
                {title}
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 13,
                  textTransform: "capitalize",
                }}
              >
                {clip.target} · {clip.equipment}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close demonstration"
              onPress={onClose}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.trackBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X color={colors.text} size={22} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 18,
              paddingBottom: 18,
              gap: 20,
            }}
          >
            <DemoPlayer clip={clip} />
            <Text
              style={{
                color: colors.text,
                fontFamily: typography.fontFamily.bold,
                fontSize: 18,
              }}
            >
              How to perform
            </Text>
            {clip.instructions.map((step, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12 }}>
                <Text
                  style={{
                    color: colors.primary,
                    fontFamily: typography.fontFamily.bold,
                  }}
                >
                  {i + 1}
                </Text>
                <Text
                  style={{
                    flex: 1,
                    color: colors.textMuted,
                    fontSize: 14,
                    lineHeight: 21,
                  }}
                >
                  {step}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{
              marginHorizontal: 18,
              marginTop: 8,
              minHeight: 48,
              borderRadius: 16,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontFamily: typography.fontFamily.semibold,
              }}
            >
              Back to exercise
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function ExerciseDemo({
  exerciseId,
  name,
  compact = false,
  enabled = true,
}: {
  exerciseId?: string;
  name: string;
  compact?: boolean;
  enabled?: boolean;
}) {
  const { colors, typography } = useAppTheme();
  const [open, setOpen] = useState(false);
  const clip = findExerciseDemo(exerciseId);
  useEffect(() => {
    setOpen(false);
  }, [exerciseId, enabled]);
  if (!clip || !enabled) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Watch ${name} demonstration`}
        onPress={(event) => {
          event.stopPropagation();
          Keyboard.dismiss();
          setOpen(true);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          alignSelf: compact ? "flex-start" : "stretch",
          padding: compact ? 0 : 10,
          borderRadius: 16,
          borderWidth: compact ? 0 : 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <DemoThumbnail source={clip.source} size={compact ? 48 : 56} />
        {!compact ? (
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{
                color: colors.primary,
                fontFamily: typography.fontFamily.semibold,
                fontSize: 14,
              }}
            >
              Watch demo
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              See the movement
            </Text>
          </View>
        ) : null}
      </Pressable>
      {open ? (
        <ExerciseDemoSheet
          clip={clip}
          title={name}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
