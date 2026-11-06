// app/(auth)/login.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { supabase } from "../../lib/supabase";
import { useAppTheme } from "../../lib/useAppTheme";
import { useAuth } from "../../lib/authContext";

import { NativeTestLogin } from "@/components/testing/NativeTestLogin";

WebBrowser.maybeCompleteAuthSession();

type LoadingProvider = "google" | "apple" | null;

export default function AuthIndex() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [loadingProvider, setLoadingProvider] = useState<LoadingProvider>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAppleAvailability() {
      if (Platform.OS !== "ios") {
        if (mounted) setAppleAvailable(false);
        return;
      }

      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (mounted) setAppleAvailable(available);
      } catch {
        if (mounted) setAppleAvailable(false);
      }
    }

    void checkAppleAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  async function signInWithGoogle() {
    try {
      setLoadingProvider("google");

      const redirectTo = Linking.createURL("/callback");

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error("No Google auth URL returned.");

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
      );

      if (result.type === "cancel" || result.type === "dismiss") return;

      if (result.type !== "success" || !result.url) {
        throw new Error("Google sign-in did not complete.");
      }

      const url = new URL(result.url);
      const code = url.searchParams.get("code");
      const errorCode = url.searchParams.get("error_code");
      const errorDescription = url.searchParams.get("error_description");

      if (errorCode) {
        throw new Error(errorDescription ?? errorCode);
      }

      if (!code) {
        throw new Error("Google callback did not include auth code.");
      }

      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) throw exchangeError;

      router.replace("/callback");
    } catch (e: any) {
      console.warn("[Google] sign-in failed", e);
      Alert.alert(
        "Google sign-in failed",
        e?.message ?? "Could not continue with Google.",
      );
    } finally {
      setLoadingProvider(null);
    }
  }

  async function signInWithApple() {
    try {
      setLoadingProvider("apple");

      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      let credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      const appleFullName = [
        credential.fullName?.givenName,
        credential.fullName?.familyName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      console.log(
        "[Apple] raw fullName:",
        JSON.stringify(credential.fullName, null, 2),
      );
      console.log("[Apple] credential email:", credential.email);
      console.log("[Apple] built appleFullName:", appleFullName || "(empty)");

      if (!credential.identityToken) {
        throw new Error("Apple did not return an identity token.");
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) throw error;

      console.log("[Apple] Supabase user id:", data.user?.id);
      console.log("[Apple] Supabase user email:", data.user?.email);

      if (data.user?.id && appleFullName) {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            name: appleFullName,
            full_name: appleFullName,
            apple_full_name: appleFullName,
            provider: "apple",
          },
        });

        console.log("[Apple] metadata save error:", metadataError);

        const { data: profileRows, error: profileError } = await supabase
          .from("profiles")
          .upsert(
            {
              id: data.user.id,
              name: appleFullName,
              email: data.user.email ?? credential.email ?? null,
            },
            { onConflict: "id" },
          )
          .select("id, name, email");

        console.log("[Apple] profile upsert rows:", profileRows);
        console.log("[Apple] profile upsert error:", profileError);
      } else {
        console.log("[Apple] skipped profile name save", {
          hasUserId: !!data.user?.id,
          appleFullName,
        });
      }

      router.replace("/callback");
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") return;

      Alert.alert(
        "Apple sign-in failed",
        e?.message ?? "Could not continue with Apple.",
      );
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome to MuscleMetric</Text>
        <Text style={styles.subtitle}>
          Continue with Apple or Google to create or access your account.
        </Text>

        <NativeTestLogin />

        {Platform.OS === "ios" && appleAvailable && (
          <View style={styles.appleWrap}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={
                colors.bg === "#000"
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={12}
              style={styles.appleButton}
              onPress={signInWithApple}
            />
          </View>
        )}

        <Pressable
          onPress={signInWithGoogle}
          style={styles.googleButton}
          disabled={!!loadingProvider}
        >
          {loadingProvider === "google" ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.googleContent}>
              <GoogleLogo />
              <Text style={styles.googleText}>Continue with Google</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.footer}>
          By continuing, you agree to{" "}
          <Text
            style={{ textDecorationLine: "underline" }}
            onPress={() =>
              Linking.openURL(
                "https://musclemetric.github.io/musclemetric-legal/terms.html",
              )
            }
          >
            Terms of Use
          </Text>{" "}
          and{" "}
          <Text
            style={{ textDecorationLine: "underline" }}
            onPress={() =>
              Linking.openURL(
                "https://musclemetric.github.io/musclemetric-legal/privacy.html",
              )
            }
          >
            Privacy Policy
          </Text>
        </Text>
      </View>
    </View>
  );
}

/* ---------------- GOOGLE LOGO ---------------- */
function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.2 0 6 1.1 8.2 3.2l6.1-6.1C34.6 2.5 29.7 0 24 0 14.7 0 6.7 5.4 2.9 13.3l7.1 5.5C12.2 13.2 17.6 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.7-2 5-4.2 6.6l6.5 5c3.8-3.5 6.4-8.6 6.4-15.6z"
      />
      <Path
        fill="#FBBC05"
        d="M10 28.8c-1-2.7-1-5.6 0-8.3l-7.1-5.5C1 18.2 0 21 0 24s1 5.8 2.9 8.9l7.1-4.1z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.5 0 12-2.1 16-5.8l-6.5-5c-2 1.4-4.6 2.2-9.5 2.2-6.4 0-11.8-3.7-13.8-9.3l-7.1 4.1C6.7 42.6 14.7 48 24 48z"
      />
    </Svg>
  );
}

/* ---------------- STYLES ---------------- */
const makeStyles = (colors: any) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
      paddingHorizontal: 24,
    },

    container: {
      width: "100%",
      maxWidth: 420,
    },
    title: {
      fontSize: 30,
      fontWeight: "800",
      marginBottom: 10,
      color: colors.text,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 15,
      color: colors.subtle,
      textAlign: "center",
      marginBottom: 28,
    },

    appleWrap: {
      marginBottom: 12,
    },
    appleButton: {
      width: "100%",
      height: 50,
    },

    googleButton: {
      backgroundColor: "#fff",
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#ddd",
    },
    googleContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    googleText: {
      fontSize: 16,
      fontWeight: "600",
      color: "#000",
    },

    footer: {
      marginTop: 20,
      textAlign: "center",
      color: colors.subtle,
      fontSize: 12,
    },
  });
