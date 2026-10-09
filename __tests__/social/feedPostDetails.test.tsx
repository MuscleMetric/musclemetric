/* eslint-disable @typescript-eslint/no-require-imports -- Jest mocks native components in isolation. */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { FeedItem } from "@/app/features/social/feed/FeedItem";
import type { FeedRow } from "@/app/features/social/feed/types";

jest.mock("@/lib/useAppTheme", () => ({
  useAppTheme: () => ({
    colors: {
      bg: "#fff",
      surface: "#fff",
      border: "#ddd",
      text: "#111",
      textMuted: "#666",
      primary: "#2563eb",
    },
    typography: {
      fontFamily: { regular: "System", medium: "System", semibold: "System", bold: "System" },
      size: { body: 16, meta: 12 },
      lineHeight: { body: 20, meta: 16 },
    },
    layout: {
      space: { sm: 8, md: 12, lg: 16 },
      radius: { lg: 12, xl: 16 },
    },
  }),
}));
jest.mock("@/ui/media/WorkoutCover", () => {
  const { View } = require("react-native");
  return { WorkoutCover: () => <View /> };
});
jest.mock("@/app/features/social/feed/components/UserMetaRow", () => {
  const { View } = require("react-native");
  return { UserMetaRow: () => <View /> };
});
jest.mock("@/app/features/social/feed/components/FeedActionsRow", () => {
  const { View } = require("react-native");
  return { FeedActionsRow: () => <View /> };
});

const basePost = {
  post_id: "post-1",
  user_name: "Tester",
  user_username: "tester",
  created_at: "2026-10-08T22:32:29Z",
  caption: "Training update",
  like_count: 0,
  comment_count: 0,
  viewer_liked: false,
} as unknown as FeedRow;

it.each(["workout", "pr"] as const)(
  "opens %s post details when the post content is pressed",
  (postType) => {
    const post = {
      ...basePost,
      post_type: postType,
      workout_snapshot: {},
      pr_snapshot: {},
    } as FeedRow;
    const onOpenPost = jest.fn();

    const screen = render(
      <FeedItem
        item={post}
        onToggleLike={jest.fn()}
        onOpenComments={onOpenPost}
      />,
    );

    fireEvent.press(screen.getByLabelText("Open post details"));

    expect(onOpenPost).toHaveBeenCalledTimes(1);
    expect(onOpenPost).toHaveBeenCalledWith(post);
  },
);
