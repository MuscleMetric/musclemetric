import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { supabase } from "@/lib/supabase";

// Rendered only in explicitly configured local automation builds. Uses real Auth.
export function NativeTestLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (process.env.EXPO_PUBLIC_NATIVE_E2E !== "true") return null;
  return <View style={{ padding: 16, gap: 8, backgroundColor: "white" }}>
    <Text>Disposable database test sign-in</Text>
    <TextInput testID="e2e-email" accessibilityLabel="Test email" autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="Test email" style={{ color: "black", borderWidth: 1, padding: 8 }} />
    <TextInput testID="e2e-password" accessibilityLabel="Test password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Test password" style={{ color: "black", borderWidth: 1, padding: 8 }} />
    <Pressable testID="e2e-sign-in" disabled={busy} onPress={async () => {
      setBusy(true); setMessage("");
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMessage("Test sign-in failed");
      } catch { setMessage("Test sign-in failed"); }
      finally { setBusy(false); }
    }} style={{ padding: 12, backgroundColor: "#ddd" }}><Text>{busy ? "Signing in…" : "Sign in to test database"}</Text></Pressable>
    {!!message && <Text testID="e2e-login-error">{message}</Text>}
  </View>;
}
