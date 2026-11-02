// app/features/workouts/create/modals/AddExercisesSheet.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Dimensions,
  Modal,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Pill, Icon } from "@/ui";
import { useAppTheme } from "../../../../../lib/useAppTheme";
import { supabase } from "../../../../../lib/supabase";
import { fetchExercises, type ExerciseListItem } from "../data/exercises.query";

type Props = {
  visible: boolean;
  userId: string;

  /**
   * IMPORTANT: We now treat selectedIds as "already in the workout".
   * These will be shown at the top and disabled (cannot be toggled).
   */
  selectedIds: string[];

  onClose: () => void;

  /**
   * onDone returns ONLY newly picked exercises (excludes existing locked ones).
   */
  onDone: (picked: Array<{ exerciseId: string; name: string }>) => void;

  // default these ON so chips appear unless you explicitly disable
  enableMuscleFilter?: boolean;
  enableEquipmentFilter?: boolean;
};

type Chip = { key: string; label: string };

const FOOTER_H = 76;

const MUSCLE_OPTIONS: Chip[] = [
  { key: "Chest", label: "Chest" },
  { key: "Back", label: "Back" },
  { key: "Legs", label: "Legs" },
  { key: "Shoulders", label: "Shoulders" },
  { key: "Arms", label: "Arms" },
  { key: "Core", label: "Core" },
];

const EQUIP_OPTIONS: Chip[] = [
  { key: "barbell", label: "Barbell" },
  { key: "dumbbell", label: "Dumbbells" },
  { key: "machine", label: "Machine" },
  { key: "cable", label: "Cable" },
  { key: "bodyweight", label: "Bodyweight" },
];

type PickerMode = null | "muscle" | "equipment";

export default function AddExercisesSheet({
  visible,
  userId,
  selectedIds,
  onClose,
  onDone,
  enableMuscleFilter = true,
  enableEquipmentFilter = true,
}: Props) {
  const { colors, typography, layout } = useAppTheme();
  const styles = useMemo(
    () => makeStyles(colors, typography, layout),
    [colors, typography, layout]
  );

  const windowH = Dimensions.get("window").height;

  const [query, setQuery] = useState("");
  const [favouritesOnly, setFavouritesOnly] = useState(false);

  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);

  const [pickerMode, setPickerMode] = useState<PickerMode>(null);

  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState<ExerciseListItem[]>([]);

  // Keep just-created exercises visible even when an older catalogue request finishes.
  const [createdItems, setCreatedItems] = useState<ExerciseListItem[]>([]);
  const [createMode, setCreateMode] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createEquipment, setCreateEquipment] = useState<string | null>(null);
  const [createMuscles, setCreateMuscles] = useState<number[]>([]);
  const [muscleOptions, setMuscleOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [loadingMuscles, setLoadingMuscles] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const exitCreate = useCallback(() => {
    setCreateMode(false);
    setCreateError(null);
  }, []);

  // locked = already in workout (disabled)
  const locked = useMemo(() => new Set(selectedIds), [selectedIds]);

  // picked = newly selected in this modal session (NOT including locked)
  const [picked, setPicked] = useState<Map<string, { exerciseId: string; name: string }>>(new Map());

  useEffect(() => {
    if (!visible) return;

    // reset modal state each open
    setQuery("");
    setFavouritesOnly(false);
    setMuscle(null);
    setEquipment(null);
    setPickerMode(null);
    setPicked(new Map());
    setCreatedItems([]);
    setCreateMode(false);
    setCreateName("");
    setCreateDescription("");
    setCreateEquipment(null);
    setCreateMuscles([]);
    setCreateError(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetchExercises({
          userId,
          filters: {
            query,
            favouritesOnly,
            muscle,
            equipment,
            limit: 160,
          },
        });

        if (!cancelled) setItems(res);
      } catch (e) {
        console.warn("fetchExercises error:", e);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const t = setTimeout(load, 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [visible, userId, query, favouritesOnly, muscle, equipment]);


  // Same authenticated muscle catalogue and private-exercise RPC used by live Add exercises.
  useEffect(() => {
    if (!visible || !createMode) return;
    let cancelled = false;
    setLoadingMuscles(true);
    setCreateError(null);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("muscles")
          .select("id,name")
          .order("name", { ascending: true });
        if (error) throw error;
        if (!cancelled) {
          setMuscleOptions((data ?? []).map((m) => ({ id: Number(m.id), name: String(m.name) })));
        }
      } catch {
        if (!cancelled) {
          setMuscleOptions([]);
          setCreateError("Couldn’t load muscles. Go back and try again.");
        }
      } finally {
        if (!cancelled) setLoadingMuscles(false);
      }
    })();

    return () => { cancelled = true; };
  }, [visible, createMode]);

  const submitCreate = async () => {
    if (createSaving) return;
    const name = createName.trim();
    if (name.length < 2) return setCreateError("Enter a name with at least 2 characters.");
    if (!createEquipment) return setCreateError("Select equipment.");
    if (createMuscles.length < 1 || createMuscles.length > 3) {
      return setCreateError("Select 1 to 3 muscles.");
    }
    if (!userId) return setCreateError("Sign in to create an exercise.");

    setCreateSaving(true);
    setCreateError(null);
    try {
      const { data, error } = await supabase.rpc("create_private_exercise", {
        p_name: name,
        p_equipment: createEquipment,
        p_muscle_ids: createMuscles,
        p_instructions: createDescription.trim() || null,
      });
      if (error) throw error;
      if (typeof data !== "string" || !/^[a-f0-9-]{36}$/i.test(data)) {
        throw new Error("The exercise was not returned correctly.");
      }

      const created: ExerciseListItem = {
        id: data,
        name,
        equipment: createEquipment,
        muscleNames: muscleOptions.filter((m) => createMuscles.includes(m.id)).map((m) => m.name),
        isFavourite: false,
        sessionsCount: 0,
      };
      setCreatedItems((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
      setPicked((prev) => new Map(prev).set(created.id, { exerciseId: created.id, name }));
      // Clear catalogue filters so the new selection is immediately visible.
      setQuery("");
      setFavouritesOnly(false);
      setMuscle(null);
      setEquipment(null);
      setPickerMode(null);
      exitCreate();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Couldn’t create exercise. Try again.");
    } finally {
      setCreateSaving(false);
    }
  };

  const togglePicked = useCallback(
    (item: ExerciseListItem) => {
      const id = item.id;
      // locked ones cannot be toggled
      if (locked.has(id)) return;

      setPicked((prev) => {
        const next = new Map(prev);
        if (next.has(id)) next.delete(id);
        else next.set(id, { exerciseId: id, name: item.name });
        return next;
      });
    },
    [locked]
  );

  const countNew = picked.size;

  const onPressAdd = useCallback(() => {
    const pickedItems = [...picked.values()].filter((x) => !locked.has(x.exerciseId));

    onDone(pickedItems);
    onClose();
  }, [picked, locked, onDone, onClose]);

  const toggleFavourite = useCallback(
    async (exerciseId: string) => {
      const current = [...createdItems, ...items].find((x) => x.id === exerciseId);
      const nowFav = !(current?.isFavourite ?? false);

      // optimistic
      const markFavourite = (prev: ExerciseListItem[], isFavourite: boolean) =>
        prev.map((x) => x.id === exerciseId ? { ...x, isFavourite } : x);
      setItems((prev) => markFavourite(prev, nowFav));
      setCreatedItems((prev) => markFavourite(prev, nowFav));

      try {
        if (nowFav) {
          const { error } = await supabase
            .from("exercise_favorites")
            .insert({ user_id: userId, exercise_id: exerciseId });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("exercise_favorites")
            .delete()
            .eq("user_id", userId)
            .eq("exercise_id", exerciseId);
          if (error) throw error;
        }
      } catch (e) {
        // rollback
        setItems((prev) => markFavourite(prev, !nowFav));
        setCreatedItems((prev) => markFavourite(prev, !nowFav));
        console.warn("toggleFavourite failed:", e);
      }
    },
    [items, createdItems, userId]
  );

  // sort: locked first, then picked, then rest
  const sortedItems = useMemo(() => {
    const score = (id: string) => {
      if (locked.has(id)) return 0;
      if (picked.has(id)) return 1;
      return 2;
    };

    const matchesCreatedFilters = (item: ExerciseListItem) =>
      (!query || item.name.toLowerCase().includes(query.trim().toLowerCase())) &&
      (!equipment || (item.equipment ?? "").toLowerCase().includes(equipment.toLowerCase())) &&
      (!muscle || (item.muscleNames ?? []).some((m) => m.toLowerCase().includes(muscle.toLowerCase()))) &&
      (!favouritesOnly || !!item.isFavourite);
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const item of createdItems) {
      if (matchesCreatedFilters(item)) byId.set(item.id, item);
    }
    return [...byId.values()].sort((a, b) => {
      const sa = score(a.id);
      const sb = score(b.id);
      if (sa !== sb) return sa - sb;

      // secondary: most used first (nice feel)
      const ua = a.sessionsCount ?? 0;
      const ub = b.sessionsCount ?? 0;
      if (ua !== ub) return ub - ua;

      return a.name.localeCompare(b.name);
    });
  }, [items, createdItems, locked, picked, query, equipment, muscle, favouritesOnly]);

  const setPicker = (mode: PickerMode) => {
    setPickerMode((prev) => (prev === mode ? null : mode));
  };

  const closeModal = () => {
    // mimic sheet close behavior
    onClose();
  };

  const header = (
    <View style={styles.header}>
      <Pressable onPress={closeModal} hitSlop={12} style={styles.headerIconBtn}>
        <Icon name="chevron-back" size={22} color={colors.text} />
      </Pressable>

      <Text style={styles.headerTitle}>Add Exercises</Text>

      <Pressable onPress={closeModal} hitSlop={12} style={styles.headerIconBtn}>
        <Text style={styles.headerClose}>✕</Text>
      </Pressable>
    </View>
  );

  const chips = (
    <View style={[styles.chipsRow, { marginTop: layout.space.md }]}>
      {/* Favourites */}
      <Pressable onPress={() => setFavouritesOnly((v) => !v)}>
        <Pill
          label="Favourites"
          tone={favouritesOnly ? "primary" : "neutral"}
        />
      </Pressable>

      {/* Muscle */}
      {enableMuscleFilter ? (
        <Pressable onPress={() => setPicker("muscle")}>
          <View style={styles.filterChipWrap}>
            <Pill
              label={muscle ? `Muscle: ${muscle}` : "Muscle"}
              tone={pickerMode === "muscle" || !!muscle ? "primary" : "neutral"}
            />
            {muscle ? (
              <Pressable
                onPress={(e) => {
                  (e as any)?.stopPropagation?.();
                  setMuscle(null);
                }}
                hitSlop={10}
                style={styles.clearMini}
              >
                <Text style={styles.clearMiniText}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      ) : null}

      {/* Equipment */}
      {enableEquipmentFilter ? (
        <Pressable onPress={() => setPicker("equipment")}>
          <View style={styles.filterChipWrap}>
            <Pill
              label={equipment ? `Equipment: ${equipment}` : "Equipment"}
              tone={
                pickerMode === "equipment" || !!equipment
                  ? "primary"
                  : "neutral"
              }
            />
            {equipment ? (
              <Pressable
                onPress={(e) => {
                  (e as any)?.stopPropagation?.();
                  setEquipment(null);
                }}
                hitSlop={10}
                style={styles.clearMini}
              >
                <Text style={styles.clearMiniText}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );

  const pickerPanel = (
    <View style={styles.pickerPanel}>
      {pickerMode === "muscle" ? (
        <>
          <Text style={styles.pickerTitle}>Select a muscle</Text>
          <View style={styles.pickerGrid}>
            {MUSCLE_OPTIONS.map((opt) => {
              const active = muscle === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    setMuscle((m) => (m === opt.key ? null : opt.key));
                  }}
                >
                  <Pill label={opt.label} tone={active ? "primary" : "neutral"} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {pickerMode === "equipment" ? (
        <>
          <Text style={styles.pickerTitle}>Select equipment</Text>
          <View style={styles.pickerGrid}>
            {EQUIP_OPTIONS.map((opt) => {
              const active = equipment === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    setEquipment((e) => (e === opt.key ? null : opt.key));
                  }}
                >
                  <Pill label={opt.label} tone={active ? "primary" : "neutral"} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );

  const createPanel = (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Pressable onPress={exitCreate} hitSlop={12} style={styles.headerIconBtn}>
          <Icon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Create exercise</Text>
        <View style={styles.headerIconBtn} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}
      >
        <View>
          <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>Name</Text>
          <TextInput
            value={createName}
            onChangeText={setCreateName}
            placeholder="e.g. Wide-Grip Cable Row"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="words"
            accessibilityLabel="Exercise name"
          />
        </View>
        <View>
          <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>Description (optional)</Text>
          <TextInput
            value={createDescription}
            onChangeText={setCreateDescription}
            placeholder="Setup, cues or notes"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { minHeight: 76, textAlignVertical: "top" }]}
            multiline
            accessibilityLabel="Exercise description"
          />
        </View>
        <View>
          <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>
            Muscles (select up to 3)
          </Text>
          {loadingMuscles ? <ActivityIndicator /> : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {muscleOptions.map((m) => {
                const active = createMuscles.includes(m.id);
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setCreateMuscles((prev) =>
                      active ? prev.filter((id) => id !== m.id) : prev.length < 3 ? [...prev, m.id] : prev
                    )}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                  >
                    <Pill label={m.name} tone={active ? "primary" : "neutral"} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
        <View>
          <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>Equipment</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {EQUIP_OPTIONS.map((eq) => (
              <Pressable
                key={eq.key}
                onPress={() => setCreateEquipment(eq.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: createEquipment === eq.key }}
              >
                <Pill label={eq.label} tone={createEquipment === eq.key ? "primary" : "neutral"} />
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Custom strength exercises are private to your account.
        </Text>
        {createError ? (
          <Text accessibilityRole="alert" style={{ color: colors.primary, fontSize: 13 }}>
            {createError}
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.stickyFooter}>
        <Pressable
          onPress={submitCreate}
          disabled={createSaving || loadingMuscles}
          style={[styles.primaryBtn, { flex: 1 }, createSaving || loadingMuscles ? styles.primaryBtnDisabled : null]}
        >
          {createSaving ? <ActivityIndicator /> : null}
          <Text style={styles.primaryText}>Create exercise</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={createMode ? exitCreate : closeModal}
    >
      <SafeAreaView style={[styles.screen, { minHeight: windowH }]}>
        {createMode ? createPanel : (
          <>
        {header}

        <View style={styles.body}>
          {/* Search */}
          <View style={styles.searchWrap}>
            <Icon name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search exercises..."
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <Text style={styles.clear}>✕</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Chips */}
          {chips}

          {/* Picker (inline expand) */}
          {pickerMode ? (
            <View style={{ marginTop: layout.space.md }}>{pickerPanel}</View>
          ) : null}

          {/* Keep existing picker and use the authenticated private-exercise RPC to create. */}
          <Pressable
            onPress={() => {
              setCreateName("");
              setCreateDescription("");
              setCreateEquipment(null);
              setCreateMuscles([]);
              setCreateError(null);
              setCreateMode(true);
            }}
            style={[styles.secondaryBtn, { alignSelf: "flex-start", marginTop: layout.space.md }]}
          >
            <Text style={styles.secondaryText}>+ Create exercise</Text>
          </Pressable>

          {/* List */}
          <View style={{ flex: 1, marginTop: layout.space.md }}>
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingBottom: FOOTER_H + layout.space.lg,
              }}
            >
              {loading ? (
                <View style={{ paddingVertical: layout.space.lg }}>
                  <Text style={styles.muted}>Loading…</Text>
                </View>
              ) : sortedItems.length === 0 ? (
                <View style={{ paddingVertical: layout.space.lg }}>
                  <Text style={styles.muted}>No exercises found.</Text>
                </View>
              ) : (
                sortedItems.map((item) => {
                  const isLocked = locked.has(item.id);
                  const isPicked = picked.has(item.id);
                  const checked = isLocked || isPicked;

                  const primaryMuscle =
                    (item.muscleNames && item.muscleNames[0]) || "—";
                  const used = item.sessionsCount ?? 0;
                  const fav = !!item.isFavourite;

                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => togglePicked(item)}
                      style={[
                        styles.itemRow,
                        isLocked ? styles.itemRowLocked : null,
                      ]}
                      disabled={isLocked}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle} numberOfLines={1}>
                          {item.name}
                        </Text>

                        <Text style={styles.itemMeta} numberOfLines={1}>
                          {primaryMuscle}
                          {item.equipment ? ` • ${item.equipment}` : ""}
                          {` • Used ${used}`}
                          {isLocked ? ` • In workout` : ""}
                        </Text>
                      </View>

                      {/* Star toggle */}
                      <Pressable
                        onPress={(e) => {
                          (e as any)?.stopPropagation?.();
                          toggleFavourite(item.id);
                        }}
                        hitSlop={12}
                        style={styles.starBtn}
                      >
                        <Text
                          style={[
                            styles.star,
                            fav ? styles.starOn : styles.starOff,
                          ]}
                        >
                          ★
                        </Text>
                      </Pressable>

                      {/* selection */}
                      <View
                        style={[
                          styles.checkCircle,
                          checked ? styles.checkOn : styles.checkOff,
                        ]}
                      >
                        {checked ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>

        {/* Sticky footer */}
        <View style={[styles.stickyFooter, { height: FOOTER_H }]}>
          <Text style={styles.footerLeft}>
            Selected <Text style={styles.strong}>{countNew}</Text>
          </Text>

          <View style={{ flexDirection: "row", gap: layout.space.sm }}>
            <Pressable onPress={closeModal} style={styles.secondaryBtn}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={onPressAdd}
              style={[
                styles.primaryBtn,
                countNew === 0 ? styles.primaryBtnDisabled : null,
              ]}
              disabled={countNew === 0}
            >
              <Text style={styles.primaryText}>Add ({countNew})</Text>
            </Pressable>
          </View>
        </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (colors: any, typography: any, layout: any) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },

    header: {
      height: 54,
      paddingHorizontal: layout.space.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg,
    },
    headerIconBtn: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
    },
    headerTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.h2 ?? 18,
      lineHeight: (typography.lineHeight.h2 ?? 22) as number,
      color: colors.text,
      letterSpacing: -0.2,
    },
    headerClose: {
      color: colors.textMuted,
      fontSize: 18,
      fontFamily: typography.fontFamily.bold,
    },

    body: {
      flex: 1,
      paddingHorizontal: layout.space.md,
      paddingTop: layout.space.md,
    },

    muted: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sub,
      lineHeight: typography.lineHeight.sub,
      color: colors.textMuted,
    },
    strong: {
      color: colors.text,
      fontFamily: typography.fontFamily.semibold,
    },

    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: layout.space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: layout.radius.xl,
      paddingHorizontal: layout.space.md,
      paddingVertical: Platform.OS === "ios" ? 12 : 10,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.body,
      lineHeight: typography.lineHeight.body,
    },
    clear: {
      color: colors.textMuted,
      fontSize: 16,
      fontFamily: typography.fontFamily.bold,
    },

    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: layout.space.sm,
      alignItems: "center",
    },
    filterChipWrap: {
      flexDirection: "row",
      alignItems: "center",
    },
    clearMini: {
      marginLeft: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    clearMiniText: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: typography.fontFamily.bold,
      lineHeight: 12,
    },

    pickerPanel: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: layout.radius.lg,
      padding: layout.space.md,
    },
    pickerTitle: {
      color: colors.textMuted,
      fontFamily: typography.fontFamily.semibold,
      fontSize: 12,
      letterSpacing: 0.6,
      marginBottom: layout.space.sm,
    },
    pickerGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: layout.space.sm,
    },

    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: layout.space.md,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    itemRowLocked: {
      opacity: 0.65,
    },
    itemTitle: {
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.body,
      lineHeight: typography.lineHeight.body,
      color: colors.text,
    },
    itemMeta: {
      marginTop: 2,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sub,
      lineHeight: typography.lineHeight.sub,
      color: colors.textMuted,
    },

    starBtn: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
    },
    star: {
      fontSize: 20,
      lineHeight: 20,
      fontFamily: typography.fontFamily.bold,
    },
    starOn: { color: colors.primary },
    starOff: { color: colors.textMuted },

    checkCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
    },
    checkOff: {
      borderColor: colors.border,
      backgroundColor: "transparent",
    },
    checkOn: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    checkMark: {
      color: "#fff",
      fontFamily: typography.fontFamily.bold,
      fontSize: 14,
    },

    stickyFooter: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: layout.space.md,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footerLeft: {
      color: colors.textMuted,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sub,
      lineHeight: typography.lineHeight.sub,
    },

    secondaryBtn: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: layout.radius.xl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    secondaryText: {
      color: colors.text,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sub,
      lineHeight: typography.lineHeight.sub,
    },

    primaryBtn: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: layout.radius.xl,
      backgroundColor: colors.primary,
    },
    primaryBtnDisabled: {
      opacity: 0.45,
    },
    primaryText: {
      color: "#fff",
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sub,
      lineHeight: typography.lineHeight.sub,
    },
  });
