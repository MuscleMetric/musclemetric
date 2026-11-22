import { supabase } from "@/lib/supabase";
import type { Point, Run } from "./runMetrics";

// A history link can be opened on a second phone. Only complete owner backups
// are readable here; never infer continuity from samples lacking segment metadata.
export async function restoreHistoryRun(owner: string, historyId: string): Promise<Run | null> {
  const header = await supabase.from("cardio_recordings").select("*")
    .eq("user_id", owner).eq("workout_history_id", historyId).eq("source", "gps").eq("status", "completed").maybeSingle();
  if (header.error) throw Error("Private route unavailable");
  if (!header.data) return null;
  const h = header.data;
  const points: Point[] = [];
  const page = 500;
  for (let offset = 0; ; offset += page) {
    const rows = await supabase.from("cardio_route_points")
      .select("recorded_at,latitude,longitude,horizontal_accuracy_m,leg_index,active_ms,cumulative_meters")
      .eq("recording_id", h.id).order("point_index").range(offset, offset + page - 1);
    if (rows.error) throw Error("Private route unavailable");
    for (const p of rows.data) {
      if (p.leg_index == null || p.active_ms == null || p.cumulative_meters == null) throw Error("Segment data unavailable");
      points.push({ time: Date.parse(p.recorded_at), latitude: Number(p.latitude), longitude: Number(p.longitude),
        accuracy: Number(p.horizontal_accuracy_m), meters: Number(p.cumulative_meters), activeMs: Number(p.active_ms), leg: p.leg_index });
    }
    if (rows.data.length < page) break;
  }
  return { version: 1, id: h.id, owner, points, start: Date.parse(h.started_at), end: Date.parse(h.completed_at),
    accumulatedMs: h.moving_seconds * 1000, activeSince: null, historyId, rejected: 0, leg: points[points.length - 1]?.leg ?? 0,
    type: h.run_type, effort: h.effort_rpe, routeSynced: true };
}
