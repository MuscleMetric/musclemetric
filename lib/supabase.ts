// lib/supabase.ts
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL = "https://cpzgnhchdpkxnebjsyyi.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwemduaGNoZHBreG5lYmpzeXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMzU1NTYsImV4cCI6MjA3NTYxMTU1Nn0.hmDtqnRzofHJ2Zg2AMyF1jY1Et6MPocJehZAfJYHzK8";

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || SUPABASE_URL;
const configuredAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

// Automation traffic goes through the loopback fault-injection proxy.
if (process.env.EXPO_PUBLIC_NATIVE_E2E === "true") {
  const target = new URL(configuredUrl);
  if (target.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(target.hostname)) {
    throw new Error("Native E2E builds require the local test proxy");
  }
}

export const supabase = createClient(configuredUrl, configuredAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
