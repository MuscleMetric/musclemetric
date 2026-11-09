import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { ArrowLeft, CheckCircle2, CirclePlay, Database, FlaskConical, Info, Search } from "lucide-react-native";
import { useAppTheme } from "@/lib/useAppTheme";
import { supabase } from "@/lib/supabase";
import { PREVIEW_ANIMATIONS } from "@/assets/vital-preview/manifest";
import { matchExercise } from "@/features/vitalPreview/matching";

type ExistingExercise = { id: string; name: string; equipment: string | null; type: string | null };
type Tab = "gallery" | "integration";

function Clip({ source }: { source: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} contentFit="contain" nativeControls={false} style={{ width: "100%", height: 240 }} />;
}

export default function AnimationPreview() {
  const { colors, layout, typography } = useAppTheme();
  const [activeTab, setActiveTab] = useState<Tab>("gallery");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<ExistingExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Read-only SELECT. This preview never inserts, updates or deletes production records.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("exercises")
        .select("id,name,equipment,type")
        .eq("is_public", true)
        .order("name")
        .limit(700);
      if (cancelled) return;
      setExercises(error ? [] : ((data ?? []) as ExistingExercise[]));
      setLoadError(Boolean(error));
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => PREVIEW_ANIMATIONS.map((clip) => ({
    clip,
    match: matchExercise(clip, exercises),
  })), [exercises]);

  const filteredRows = useMemo(() => rows.filter((item) => {
    const term = query.trim().toLowerCase();
    return !term || (item.clip.name + " " + item.clip.bodyPart + " " + item.clip.equipment).toLowerCase().includes(term);
  }), [rows, query]);

  const current = filteredRows.find((row) => row.clip.exerciseId === selectedId) ?? filteredRows[0] ?? null;
  const matchedCount = rows.filter((row) => row.match.status === "matched").length;

  const heading = { fontSize: 23, fontFamily: typography.fontFamily.bold, color: colors.text };
  const muted = { color: colors.textMuted, fontSize: 13, lineHeight: 19 };
  const body = { color: colors.text, fontSize: 14, lineHeight: 21 };
  const card = { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius.xl, padding: layout.space.lg };
  const tag = { backgroundColor: colors.trackBg, borderColor: colors.trackBorder, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "bottom"]}>
      <View style={{ padding: layout.space.lg, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontFamily: typography.fontFamily.semibold }}>Exercise Motion Lab</Text>
          <Text style={muted}>Vital Animations · isolated preview</Text>
        </View>
        <FlaskConical size={23} color={colors.primary} />
      </View>
      <ScrollView contentContainerStyle={{ padding: layout.space.lg, gap: layout.space.md, paddingBottom: 60 }}>
        <View style={{ ...card, borderColor: colors.primary, gap: 9 }}>
          <Text style={{ ...muted, color: colors.primary, fontFamily: typography.fontFamily.semibold }}>PROTOTYPE · NO WORKOUT DATA CHANGED</Text>
          <Text style={heading}>See the movement, not just the name.</Text>
          <Text style={body}>Explore a looping exercise demonstration alongside MuscleMetric&apos;s existing exercise metadata. Nothing on this screen can save a workout or change an exercise.</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <View style={tag}><Text style={muted}>{PREVIEW_ANIMATIONS.length} sample clips</Text></View>
            <View style={tag}><Text style={muted}>{matchedCount} confirmed matches</Text></View>
            <View style={tag}><Text style={muted}>{exercises.length} live public exercises</Text></View>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {([["gallery", "Animation gallery"], ["integration", "App placement"]] as const).map(([key, title]) => (
            <Pressable key={key} onPress={() => setActiveTab(key)} accessibilityRole="tab" accessibilityState={{ selected: activeTab === key }} style={{
              paddingVertical: 11, paddingHorizontal: 14, borderRadius: layout.radius.md,
              backgroundColor: activeTab === key ? colors.primary : colors.surface,
              borderColor: activeTab === key ? colors.primary : colors.border, borderWidth: 1,
            }}>
              <Text style={{ color: activeTab === key ? colors.onPrimary : colors.text, fontFamily: typography.fontFamily.semibold, fontSize: 13 }}>{title}</Text>
            </Pressable>
          ))}
        </View>

        {activeTab === "gallery" ? (
          <>
            {PREVIEW_ANIMATIONS.length ? (
              <>
                <View style={{ ...card, padding: 0, overflow: "hidden" }}>
                  {current ? (
                    <>
                      <View style={{ backgroundColor: colors.bg, height: 240 }}>
                        <Clip key={current.clip.exerciseId} source={current.clip.source} />
                      </View>
                      <View style={{ padding: layout.space.lg, gap: 8 }}>
                        <Text style={{ ...heading, fontSize: 20 }}>{current.clip.name}</Text>
                        <Text style={muted}>{current.clip.bodyPart} · {current.clip.equipment} · {current.clip.difficulty}</Text>
                        <Text style={{ ...muted, color: current.match.status === "matched" ? colors.success : colors.warning }}>
                          {current.match.status === "matched" ? "Matched to " + current.match.exercise?.name : current.match.status === "ambiguous" ? "Several matches — review needed" : "Not linked to a production exercise"}
                        </Text>
                        <Text style={{ ...body, fontFamily: typography.fontFamily.semibold, paddingTop: 4 }}>Technique</Text>
                        {current.clip.instructions.slice(0, 5).map((step, index) => (
                          <Text key={index} style={body}>{index + 1}. {step}</Text>
                        ))}
                        {current.clip.qualityNote ? <View style={{ borderColor: colors.warning, borderWidth: 1, borderRadius: layout.radius.md, padding: 12 }}><Text style={{ color: colors.warning, fontFamily: typography.fontFamily.semibold }}>Needs manual review</Text><Text style={body}>{current.clip.qualityNote}</Text></View> : null}
                        <Text style={muted}>Target: {current.clip.target}. Supporting: {current.clip.secondaryMuscles.join(", ") || "Not specified"}.</Text>
                      </View>
                    </>
                  ) : null}
                </View>
                <View style={{ ...card, flexDirection: "row", alignItems: "center", gap: 8, padding: 10 }}>
                  <Search size={18} color={colors.textMuted} />
                  <TextInput value={query} onChangeText={setQuery} placeholder="Find sample exercises" placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, padding: 6 }} />
                </View>
                {filteredRows.map(({ clip, match }) => (
                  <Pressable key={clip.exerciseId} onPress={() => setSelectedId(clip.exerciseId)} style={{
                    ...card, flexDirection: "row", alignItems: "center", gap: 12,
                    borderColor: current?.clip.exerciseId === clip.exerciseId ? colors.primary : colors.border,
                  }}>
                    <CirclePlay size={28} color={colors.primary} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontFamily: typography.fontFamily.semibold, color: colors.text }}>{clip.name}</Text>
                      <Text style={muted}>{clip.equipment} · {clip.target}</Text>
                    </View>
                    {match.status === "matched" ? <CheckCircle2 color={colors.success} size={18} /> : <Info color={colors.warning} size={18} />}
                  </Pressable>
                ))}
              </>
            ) : (
              <View style={{ ...card, alignItems: "center", gap: 10, paddingVertical: 32 }}>
                <CirclePlay size={44} color={colors.primary} />
                <Text style={{ ...heading, textAlign: "center", fontSize: 19 }}>Ready for the free-pack MP4s</Text>
                <Text style={{ ...muted, textAlign: "center" }}>The branch has a working animation gallery, but no media is checked into the public repository. Run the local ZIP importer to add licensed clips to this device build.</Text>
                <Text style={{ ...muted, textAlign: "center" }}>See docs/VITAL_ANIMATIONS_PREVIEW.md for setup.</Text>
              </View>
            )}
            <View style={{ ...card, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Database size={18} color={colors.primary} />
                <Text style={{ color: colors.text, fontFamily: typography.fontFamily.semibold }}>Live database: read-only</Text>
              </View>
              {loading ? <ActivityIndicator /> : (
                <Text style={muted}>{loadError ? "Could not read exercise names with the current session; the sample gallery remains local." : "Successfully read " + exercises.length + " public exercises. No inserts, updates, deletes or RPC calls."}</Text>
              )}
            </View>
          </>
        ) : (
          <>
            <View style={{ ...card, gap: 11 }}>
              <Text style={{ ...heading, fontSize: 20 }}>1 · Exercise picker</Text>
              <Text style={body}>Add a small play icon on exercise results. Tapping it opens the demonstration without interrupting plan creation.</Text>
              <Text style={{ ...muted, color: colors.primary }}>Future integration · not enabled</Text>
            </View>
            <View style={{ ...card, gap: 11 }}>
              <Text style={{ ...heading, fontSize: 20 }}>2 · Workout overview</Text>
              <Text style={body}>An animated movement card appears inside an exercise detail sheet with target muscles, form cues and a clear start-workout action.</Text>
              <Text style={{ ...muted, color: colors.primary }}>Future integration · not enabled</Text>
            </View>
            <View style={{ ...card, gap: 11 }}>
              <Text style={{ ...heading, fontSize: 20 }}>3 · Live workout</Text>
              <Text style={body}>Show a compact, optional Technique button. It opens the looped demonstration without replacing set inputs or session targets.</Text>
              <Text style={{ ...muted, color: colors.primary }}>Future integration · not enabled</Text>
            </View>
            <View style={{ ...card, gap: 8 }}>
              <Text style={{ color: colors.text, fontFamily: typography.fontFamily.semibold }}>Why the isolation matters</Text>
              <Text style={muted}>All previews are local assets. The screen only SELECTs public exercise names for matching, and never changes the existing exercises, muscle contributions or workout history.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
