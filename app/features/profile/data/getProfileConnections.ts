import { supabase } from "@/lib/supabase";

export type ProfileConnectionKind = "followers" | "following";

export type ProfileConnectionRow = {
  id: string;
  name: string | null;
  username: string | null;
};

export async function getProfileConnections(
  userId: string,
  kind: ProfileConnectionKind,
): Promise<ProfileConnectionRow[]> {
  if (!userId) return [];

  if (kind === "followers") {
    const { data: followRows, error: followError } = await supabase
      .from("user_follows")
      .select("follower_id")
      .eq("followee_id", userId);

    if (followError) throw followError;

    const ids = [...new Set((followRows ?? []).map((row) => row.follower_id).filter(Boolean))];

    if (ids.length === 0) return [];

    const { data: profiles, error: profilesError } = await supabase
      .rpc("get_social_identities_v1", { p_user_ids: ids });

    if (profilesError) throw profilesError;

    const byId = new Map(((profiles ?? []) as ProfileConnectionRow[]).map((p) => [p.id, p]));
    return ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((p) => ({
        id: p!.id,
        name: p!.name ?? null,
        username: p!.username ?? null,
      }));
  }

  const { data: followRows, error: followError } = await supabase
    .from("user_follows")
    .select("followee_id")
    .eq("follower_id", userId);

  if (followError) throw followError;

  const ids = [...new Set((followRows ?? []).map((row) => row.followee_id).filter(Boolean))];

  if (ids.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .rpc("get_social_identities_v1", { p_user_ids: ids });

  if (profilesError) throw profilesError;

  const byId = new Map(((profiles ?? []) as ProfileConnectionRow[]).map((p) => [p.id, p]));
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((p) => ({
      id: p!.id,
      name: p!.name ?? null,
      username: p!.username ?? null,
    }));
}