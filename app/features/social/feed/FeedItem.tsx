// app/features/social/feed/FeedItem.tsx

import React from "react";
import { FeedRow } from "./types";

// These will be created next
import { WorkoutPostCard } from "./posts/WorkoutPostCard";
import { PrPostCard } from "./posts/PrPostCard";

type Props = {
  item: FeedRow;
  onToggleLike: (postId: string) => void;
  onOpenComments: (post: FeedRow) => void;
};

export function FeedItem({ item, onToggleLike, onOpenComments }: Props) {
  if (item.post_type === "workout") {
    return (
      <WorkoutPostCard
        item={item}
        onToggleLike={onToggleLike}
        onOpenComments={onOpenComments}
        onOpenPost={onOpenComments}
      />
    );
  }
  if (item.post_type === "pr") {
    return (
      <PrPostCard
        item={item}
        onToggleLike={onToggleLike}
        onOpenComments={onOpenComments}
        onOpenPost={onOpenComments}
      />
    );
  }
  return null;
}
