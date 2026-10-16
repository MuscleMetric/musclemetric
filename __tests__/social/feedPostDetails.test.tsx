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

// Retain the visible title so tests can check its derived screen-reader summary.
jest.mock("@/ui/media/WorkoutCover", () => {
  const { Text } = require("react-native");
  return {
    WorkoutCover: ({ title }: { title?: string | null }) => <Text>{title}</Text>,
  };
});

// Keep the real FeedActionsRow and its Pressables; only stub native SVG icons.
jest.mock("lucide-react-native", () => ({
  ThumbsUp: () => null,
  MessageCircle: () => null,
  Share2: () => null,
}));

const basePost: FeedRow = {
  post_id: "post-1",
  user_id: "user-1",
  user_name: "Tester",
  user_username: "tester",
  post_type: "workout",
  visibility: "public",
  caption: "Training update",
  created_at: "2026-10-08T22:32:29Z",
  workout_history_id: "history-1",
  workout_snapshot: {
    workout_history_id: "history-1",
    workout_id: "workout-1",
    workout_title: "Lower A",
    workout_image_key: null,
    completed_at: "2026-10-08T22:00:00Z",
    duration_seconds: 3600,
    exercises_count: 6,
    sets_count: 18,
    total_volume: 8500,
  },
  exercise_id: "exercise-1",
  exercise_name: "Back squat",
  pr_snapshot: {
    exercise_name: "Back squat",
    recent_best_weight: 150,
    recent_best_reps: 5,
  },
  like_count: 7,
  comment_count: 3,
  viewer_liked: false,
};

function makePost(postType: "workout" | "pr", caption: string | null = "Training update"): FeedRow {
  return { ...basePost, post_type: postType, caption };
}

it.each(["workout", "pr"] as const)(
  "opens %s post details when the post content is pressed",
  (postType) => {
    const post = makePost(postType);
    const onOpenPost = jest.fn();

    const screen = render(
      <FeedItem
        item={post}
        onToggleLike={jest.fn()}
        onOpenComments={onOpenPost}
      />,
    );

    const postButton = screen.getByRole("button", { name: /Training update/ });

    expect(postButton).toHaveProp("accessibilityHint", "Opens post details");
    fireEvent.press(postButton);

    expect(onOpenPost).toHaveBeenCalledTimes(1);
    expect(onOpenPost).toHaveBeenCalledWith(post);
  },
);

it.each(["workout", "pr"] as const)(
  "keeps the like and comment controls independent of opening a %s card",
  (postType) => {
    const post = makePost(postType);
    const onToggleLike = jest.fn();
    const onOpenComments = jest.fn();

    const screen = render(
      <FeedItem
        item={post}
        onToggleLike={onToggleLike}
        onOpenComments={onOpenComments}
      />,
    );

    // Press the rendered counts inside the actual FeedActionsRow Pressables.
    fireEvent.press(screen.getByText("7"));
    expect(onToggleLike).toHaveBeenCalledTimes(1);
    expect(onToggleLike).toHaveBeenCalledWith(post.post_id);
    expect(onOpenComments).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("3"));
    expect(onOpenComments).toHaveBeenCalledTimes(1);
    expect(onOpenComments).toHaveBeenCalledWith(post);
    expect(onToggleLike).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByRole("button", { name: /Training update/ }));
    expect(onOpenComments).toHaveBeenCalledTimes(2);
    expect(onToggleLike).toHaveBeenCalledTimes(1);
  },
);

it.each(["workout", "pr"] as const)(
  "preserves the accessible author and %s summary without a caption",
  (postType) => {
    const post = makePost(postType, null);
    const onOpenPost = jest.fn();

    const screen = render(
      <FeedItem
        item={post}
        onToggleLike={jest.fn()}
        onOpenComments={onOpenPost}
      />,
    );

    // No explicit accessibilityLabel should replace the title, author or stats.
    const postButton = screen.getByRole("button", { name: /Tester/ });
    expect(postButton.props.accessibilityLabel).toBeUndefined();
    expect(postButton).toHaveProp("accessibilityHint", "Opens post details");

    if (postType === "workout") {
      expect(screen.getByRole("button", { name: /LOWER A/ })).toBe(postButton);
      expect(screen.getByRole("button", { name: /18/ })).toBe(postButton);
    } else {
      expect(screen.getByRole("button", { name: /BACK SQUAT/ })).toBe(postButton);
      expect(screen.getByRole("button", { name: /150/ })).toBe(postButton);
    }

    fireEvent.press(postButton);
    expect(onOpenPost).toHaveBeenCalledTimes(1);
    expect(onOpenPost).toHaveBeenCalledWith(post);
  },
);

it('renders a cardio post with distance and time rather than lifting volume', () => {
  const post = makePost('workout');
  post.workout_snapshot = {...post.workout_snapshot!,workout_kind:'cardio',total_volume:0,total_distance_km:5,cardio_duration_seconds:1500};
  const screen = render(<FeedItem item={post} onToggleLike={jest.fn()} onOpenComments={jest.fn()} />);
  expect(screen.getByText('DISTANCE')).toBeTruthy();
  expect(screen.getByText('5')).toBeTruthy();
  expect(screen.getByText('km')).toBeTruthy();
  expect(screen.getByText('25:00')).toBeTruthy();
  expect(screen.queryByText('VOLUME')).toBeNull();
  expect(screen.queryByText('kg')).toBeNull();
});
