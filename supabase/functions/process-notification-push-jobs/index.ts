import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { authorizeWorker } from "./auth.ts";

type ClaimedJob = {
  job_id: string;
  notification_id: string;
  recipient_id: string;
};

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type:
    | "followed_you"
    | "follow_request_received"
    | "follow_request_accepted"
    | "post_liked"
    | "post_commented"
    | "following_posted_pr"
    | "following_posted_workout"
    | "feedback_in_progress"
    | "feedback_released";
  title: string;
  body: string;
  entity_type: "profile" | "follow_request" | "post" | "comment" | "feedback";
  entity_id: string;
  push_status: "pending" | "sent" | "failed" | "skipped" | null;
};

type NotificationPreferencesRow = {
  user_id: string;
  push_enabled: boolean;
  follows_enabled: boolean;
  follow_requests_enabled: boolean;
  likes_enabled: boolean;
  comments_enabled: boolean;
  following_posts_enabled: boolean;
};

type DeviceTokenRow = {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  is_active: boolean;
};

type ExpoTicket =
  | {
      status: "ok";
      id: string;
    }
  | {
      status: "error";
      message: string;
      details?: { error?: string };
    };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function shouldSendTypePush(
  type: NotificationRow["type"],
  prefs?: NotificationPreferencesRow | null
): boolean {
  if (!prefs) return true;
  if (!prefs.push_enabled) return false;

  switch (type) {
    case "followed_you":
      return prefs.follows_enabled;
    case "follow_request_received":
    case "follow_request_accepted":
      return prefs.follow_requests_enabled;
    case "post_liked":
      return prefs.likes_enabled;
    case "post_commented":
      return prefs.comments_enabled;
    case "following_posted_pr":
    case "following_posted_workout":
      return prefs.following_posts_enabled;
    default:
      return true;
  }
}

async function markJob(
  jobId: string,
  status: "sent" | "failed" | "skipped",
  lastError: string | null = null
) {
  const { error } = await supabase
    .from("notification_push_jobs")
    .update({
      status,
      last_error: lastError,
      processed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("Failed to update job", jobId, error);
  }
}

async function markNotification(
  notificationId: string,
  status: "sent" | "failed" | "skipped"
) {
  const update: Record<string, unknown> = {
    push_status: status,
  };

  if (status === "sent") {
    update.push_sent_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("notifications")
    .update(update)
    .eq("id", notificationId);

  if (error) {
    console.error("Failed to update notification", notificationId, error);
  }
}

async function deactivateToken(tokenId: string, reason: string) {
  const { error } = await supabase
    .from("device_tokens")
    .update({
      is_active: false,
      last_error: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenId);

  if (error) {
    console.error("Failed to deactivate token", tokenId, error);
  }
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const authorized = await authorizeWorker(req.headers.get("x-worker-token"), async (token) => {
      const { data, error } = await supabase.rpc("verify_push_worker_token_v1", { p_token: token });
      return !error && data === true;
    });
    if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let batchSize = 20;

    try {
      const body = await req.json();
      if (typeof body?.batchSize === "number" && body.batchSize > 0) {
        batchSize = body.batchSize;
      }
    } catch {
      // no body provided, keep default
    }

    const { data: claimedJobs, error: claimError } = await supabase.rpc(
      "claim_notification_push_jobs_v1",
      { p_limit: batchSize }
    );

    if (claimError) {
      console.error("claim_notification_push_jobs_v1 error", claimError);
      return Response.json(
        { ok: false, stage: "claim", error: claimError.message },
        { status: 500 }
      );
    }

    const jobs = (claimedJobs ?? []) as ClaimedJob[];

    if (jobs.length === 0) {
      return Response.json({
        ok: true,
        claimed: 0,
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
      });
    }

    const notificationIds = [...new Set(jobs.map((j) => j.notification_id))];
    const recipientIds = [...new Set(jobs.map((j) => j.recipient_id))];

    const [{ data: notifications, error: notificationsError }, { data: prefs, error: prefsError }, { data: deviceTokens, error: deviceTokensError }] =
      await Promise.all([
        supabase
          .from("notifications")
          .select(
            "id, recipient_id, actor_id, type, title, body, entity_type, entity_id, push_status"
          )
          .in("id", notificationIds),
        supabase
          .from("notification_preferences")
          .select(
            "user_id, push_enabled, follows_enabled, follow_requests_enabled, likes_enabled, comments_enabled, following_posts_enabled"
          )
          .in("user_id", recipientIds),
        supabase
          .from("device_tokens")
          .select("id, user_id, token, platform, is_active")
          .eq("is_active", true)
          .in("user_id", recipientIds),
      ]);

    if (notificationsError) {
      console.error("notifications fetch error", notificationsError);
      return Response.json(
        { ok: false, stage: "notifications_fetch", error: notificationsError.message },
        { status: 500 }
      );
    }

    if (prefsError) {
      console.error("preferences fetch error", prefsError);
      return Response.json(
        { ok: false, stage: "preferences_fetch", error: prefsError.message },
        { status: 500 }
      );
    }

    if (deviceTokensError) {
      console.error("device tokens fetch error", deviceTokensError);
      return Response.json(
        { ok: false, stage: "device_tokens_fetch", error: deviceTokensError.message },
        { status: 500 }
      );
    }

    const notificationMap = new Map<string, NotificationRow>();
    for (const n of (notifications ?? []) as NotificationRow[]) {
      notificationMap.set(n.id, n);
    }

    const prefsMap = new Map<string, NotificationPreferencesRow>();
    for (const p of (prefs ?? []) as NotificationPreferencesRow[]) {
      prefsMap.set(p.user_id, p);
    }

    const tokensByUser = new Map<string, DeviceTokenRow[]>();
    for (const token of (deviceTokens ?? []) as DeviceTokenRow[]) {
      const existing = tokensByUser.get(token.user_id) ?? [];
      existing.push(token);
      tokensByUser.set(token.user_id, existing);
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const job of jobs) {
      const notification = notificationMap.get(job.notification_id);

      if (!notification) {
        await markJob(job.job_id, "failed", "notification_not_found");
        failed++;
        continue;
      }

      const userPrefs = prefsMap.get(job.recipient_id);

      if (!shouldSendTypePush(notification.type, userPrefs)) {
        await markJob(job.job_id, "skipped", "push_disabled_by_preferences");
        await markNotification(notification.id, "skipped");
        skipped++;
        continue;
      }

      const tokens = tokensByUser.get(job.recipient_id) ?? [];

      if (tokens.length === 0) {
        await markJob(job.job_id, "skipped", "no_active_device_tokens");
        await markNotification(notification.id, "skipped");
        skipped++;
        continue;
      }

      const messages = tokens.map((token) => ({
        to: token.token,
        title: notification.title,
        body: notification.body,
        sound: "default",
        data: {
          notificationId: notification.id,
          type: notification.type,
          entityType: notification.entity_type,
          entityId: notification.entity_id,
          actorId: notification.actor_id,
        },
      }));

      const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      const expoJson = await expoRes.json().catch(() => null);

      if (!expoRes.ok || !expoJson?.data) {
        const errorMessage = `expo_request_failed:${expoRes.status}`;
        await markJob(job.job_id, "failed", errorMessage);
        await markNotification(notification.id, "failed");
        failed++;
        continue;
      }

      const tickets = Array.isArray(expoJson.data)
        ? (expoJson.data as ExpoTicket[])
        : [expoJson.data as ExpoTicket];

      const ticketErrors: string[] = [];
      let hasOkTicket = false;

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const token = tokens[i];

        if (ticket.status === "ok") {
          hasOkTicket = true;
          continue;
        }

        const detailError =
          ticket.details?.error ?? ticket.message ?? "expo_ticket_error";
        ticketErrors.push(detailError);

        if (detailError === "DeviceNotRegistered") {
          await deactivateToken(token.id, detailError);
        }
      }

      if (hasOkTicket) {
        await markJob(
          job.job_id,
          "sent",
          ticketErrors.length > 0 ? ticketErrors.join(", ") : null
        );
        await markNotification(notification.id, "sent");
        sent++;
      } else {
        await markJob(
          job.job_id,
          "failed",
          ticketErrors.length > 0 ? ticketErrors.join(", ") : "all_tickets_failed"
        );
        await markNotification(notification.id, "failed");
        failed++;
      }
    }

    return Response.json({
      ok: true,
      claimed: jobs.length,
      processed: jobs.length,
      sent,
      failed,
      skipped,
    });
  } catch (error) {
    console.error("Unhandled worker error", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 }
    );
  }
});