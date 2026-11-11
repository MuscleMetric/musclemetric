import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { createVideoPlayer, type VideoThumbnail } from "expo-video";
import { Play } from "lucide-react-native";

// One thumbnail extractor at a time, one still per installed sample. No list players.
const cache = new Map<number, Promise<VideoThumbnail | null>>();
let queue: Promise<unknown> = Promise.resolve();
function thumbnail(source: number) {
  if (!cache.has(source)) {
    const task = queue.then(async () => {
      const player = createVideoPlayer(null);
      try {
        player.muted = true;
        player.audioMixingMode = "mixWithOthers";
        await player.replaceAsync(source);
        const [frame] = await player.generateThumbnailsAsync(0.5, {
          maxWidth: 160,
          maxHeight: 160,
        });
        return frame ?? null;
      } catch {
        return null;
      } finally {
        player.release();
      }
    });
    cache.set(source, task.catch(() => null));
    queue = task.catch(() => null);
  }
  return cache.get(source)!;
}

export function DemoThumbnail({
  source,
  size = 54,
}: {
  source: number;
  size?: number;
}) {
  const [frame, setFrame] = useState<VideoThumbnail | null>(null);
  useEffect(() => {
    let active = true;
    setFrame(null);
    void thumbnail(source).then((value) => {
      if (active) setFrame(value);
    });
    return () => {
      active = false;
    };
  }, [source]);
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {frame ? (
        <Image
          source={frame}
          contentFit="contain"
          style={{ width: size, height: size }}
        />
      ) : null}
      <View
        style={{
          position: "absolute",
          bottom: 3,
          right: 3,
          backgroundColor: "#2563EB",
          borderRadius: 12,
          padding: 4,
        }}
      >
        <Play size={12} color="#FFFFFF" fill="#FFFFFF" />
      </View>
    </View>
  );
}
