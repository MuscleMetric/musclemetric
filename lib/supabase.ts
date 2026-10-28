// lib/supabase.ts
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://cpzgnhchdpkxnebjsyyi.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwemduaGNoZHBreG5lYmpzeXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMzU1NTYsImV4cCI6MjA3NTYxMTU1Nn0.hmDtqnRzofHJ2Zg2AMyF1jY1Et6MPocJehZAfJYHzK8";

// An automation build must never silently fall back to the production project.
if (process.env.EXPO_PUBLIC_NATIVE_E2E === "true") {
  const target = new URL(SUPABASE_URL);
  if (target.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(target.hostname)) {
    throw new Error("Native E2E builds require disposable local Supabase");
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
