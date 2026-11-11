import { ExerciseDemo } from "@/features/vitalPreview/ExerciseDemo";
import { findExerciseDemo } from "@/features/vitalPreview/catalog";
// ui/modals/ExercisePickerSheet.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  Keyboard,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/lib/useAppTheme";

export type ExerciseOption = {
  id: string;
  name: string | null;
  type: string | null;
  equipment: string | null;
  muscleIds?: string[]; // string ids
};

type Chip = { id: string; label: string };

function capFirst(v: string) {
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}
function includesQ(s: string | null | undefined, q: string) {
  return (s ?? "").toLowerCase().includes(q);
}

function Pill(props: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  rightIcon?: string;
  leftIcon?: string;
  disabled?: boolean;
}) {
  const { colors, typography } = useAppTheme();
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: props.active ? colors.primary : colors.border,
        backgroundColor: props.active ? colors.primary : colors.surface ?? colors.bg,
        opacity: props.disabled ? 0.45 : 1,
      }}
    >
      {props.leftIcon ? (
        <Text
          style={{
            color: props.active ? "#fff" : colors.textMuted,
            fontFamily: typography.fontFamily.bold,
            fontSize: 14,
          }}
        >
          {props.leftIcon}
        </Text>
      ) : null}
      <Text
        style={{
          color: props.active ? "#fff" : colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: 13,
        }}
      >
        {props.label}
      </Text>
      {props.rightIcon ? (
        <Text
          style={{
            color: props.active ? "#fff" : colors.textMuted,
            fontFamily: typography.fontFamily.bold,
            fontSize: 13,
          }}
        >
          {props.rightIcon}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Badge(props: { label: string }) {
  const { colors, typography } = useAppTheme();
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontFamily: typography.fontFamily.semibold,
          fontSize: 12,
        }}
      >
        {props.label}
      </Text>
    </View>
  );
}

function CardRow(props: {
  item: ExerciseOption;
  disabled: boolean;
  selected: boolean;
  usedCount: number;
  fav: boolean;
  onToggle: () => void;
  onToggleFav?: () => void;
  badgeMuscle?: string | null;
}) {
  const { colors, typography } = useAppTheme();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
    {findExerciseDemo(props.item.id) ? <ExerciseDemo exerciseId={props.item.id} name={props.item.name ?? "Exercise"} compact /> : null}
    <Pressable
      onPress={() => {
        if (props.disabled) return;
        Keyboard.dismiss();
        props.onToggle();
      }}
      disabled={props.disabled}
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: props.selected ? colors.primary : colors.border,
        backgroundColor: colors.surface ?? colors.bg,
        borderRadius: 18,
        padding: 14,
        opacity: props.disabled ? 0.55 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text
            numberOfLines={2}
            style={{
              color: colors.text,
              fontFamily: typography.fontFamily.bold,
              fontSize: 15,
            }}
          >
            {props.item.name ?? "Exercise"}
          </Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 8,
            }}
          >
            {props.badgeMuscle ? <Badge label={props.badgeMuscle} /> : null}
            {props.item.equipment ? <Badge label={capFirst(props.item.equipment)} /> : null}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 10,
              gap: 8,
            }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.medium,
                fontSize: 12,
              }}
            >
              {props.usedCount > 0 ? `Used: ${props.usedCount} times` : "Never used"}
            </Text>
            {props.disabled ? (
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: 12,
                }}
              >
                • In workout
              </Text>
            ) : null}
          </View>
        </View>

        {/* star */}
        {props.onToggleFav ? (
          <Pressable
            onPress={(e: any) => {
              e?.stopPropagation?.();
              props.onToggleFav?.();
            }}
            hitSlop={10}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
          >
            <Text
              style={{
                fontSize: 18,
                fontFamily: typography.fontFamily.bold,
                color: props.fav ? colors.primary : colors.textMuted,
              }}
            >
              {props.fav ? "★" : "☆"}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}

        {/* checkbox */}
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: props.selected ? colors.primary : colors.border,
            backgroundColor: props.selected ? colors.primary : "transparent",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 4,
          }}
        >
          {props.selected ? (
            <Text
              style={{
                color: "#fff",
                fontFamily: typography.fontFamily.bold,
                fontSize: 12,
              }}
            >
              ✓
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
    </View>
  );
}

export function ExercisePickerSheet(props: {
  // header
  title?: string;

  // data
  options: ExerciseOption[];
  alreadyInIds?: string[];
  isReplaceMode?: boolean;
  replacingExerciseId?: string | null;

  // meta ordering
  usageByExerciseId?: Record<string, number>;

  // favourites
  favoriteIds?: Set<string>;
  favoritesOnly?: boolean;
  onToggleFavoritesOnly?: () => void;
  onToggleFavorite?: (exerciseId: string) => void;

  // filters
  muscleGroups?: Chip[];
  selectedMuscleId?: string | null;
  onChangeSelectedMuscleId?: (id: string | null) => void;

  equipmentOptions?: string[];
  selectedEquipment?: string | null;
  onChangeSelectedEquipment?: (eq: string | null) => void;

  // search
  search: string;
  onChangeSearch: (v: string) => void;

  // selection
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
  multiSelect?: boolean;

  // create
  onCreateExercise?: (a: {
    name: string;
    equipment: string; // required
    muscleIds: string[]; // 1..3
    instructions?: string | null; // optional (your "description")
  }) => Promise<ExerciseOption>;

  // actions
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => void;
}) {
  const { colors, typography } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [demosOnly, setDemosOnly] = useState(false);
  const [muscleMenuOpen, setMuscleMenuOpen] = useState(false);
  const [equipmentMenuOpen, setEquipmentMenuOpen] = useState(false);

  const [mode, setMode] = useState<"pick" | "create">("pick");

  // local-only created options so they appear immediately even if parent doesn't refetch
  const [createdOptions, setCreatedOptions] = useState<ExerciseOption[]>([]);

  // create form state
  const [cName, setCName] = useState("");
  const [cEquipment, setCEquipment] = useState<string | null>(null);
  const [cMuscleIds, setCMuscleIds] = useState<string[]>([]);
  const [cInstructions, setCInstructions] = useState<string>(""); // description -> instructions
  const [cErr, setCErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const alreadyIn = useMemo(() => new Set(props.alreadyInIds ?? []), [props.alreadyInIds]);
  const favIds = props.favoriteIds ?? new Set<string>();
  const usage = props.usageByExerciseId ?? {};

  const combinedOptions = useMemo(() => {
    if (!createdOptions.length) return props.options ?? [];
    const base = props.options ?? [];
    const seen = new Set(base.map((x) => x.id));
    const extras = createdOptions.filter((x) => !seen.has(x.id));
    return [...extras, ...base];
  }, [props.options, createdOptions]);

  function toggleId(id: string) {
    const exists = props.selectedIds.includes(id);
    if (!props.multiSelect) {
      props.onChangeSelectedIds(exists ? [] : [id]);
      return;
    }
    props.onChangeSelectedIds(exists ? props.selectedIds.filter((x) => x !== id) : [...props.selectedIds, id]);
  }

  const selectedMuscleLabel = useMemo(() => {
    if (!props.selectedMuscleId) return null;
    return props.muscleGroups?.find((m) => m.id === props.selectedMuscleId)?.label ?? null;
  }, [props.selectedMuscleId, props.muscleGroups]);

  const filtered = useMemo(() => {
    const q = props.search.trim().toLowerCase();
    const favoritesOnly = Boolean(props.favoritesOnly);

    const out = (combinedOptions ?? []).filter((ex) => {
      if (demosOnly && !findExerciseDemo(ex.id)) return false;
      if (favoritesOnly && !favIds.has(ex.id)) return false;

      if (props.selectedEquipment) {
        const eq = (ex.equipment ?? "").toLowerCase();
        if (eq !== props.selectedEquipment.toLowerCase()) return false;
      }

      if (props.selectedMuscleId) {
        const m = ex.muscleIds ?? [];
        if (!m.includes(props.selectedMuscleId)) return false;
      }

      if (!q) return true;
      return includesQ(ex.name, q) || includesQ(ex.type, q) || includesQ(ex.equipment, q);
    });

    out.sort((a, b) => {
      const aIsReplacing = Boolean(props.isReplaceMode) && props.replacingExerciseId === a.id;
      const bIsReplacing = Boolean(props.isReplaceMode) && props.replacingExerciseId === b.id;

      const aDisabled = alreadyIn.has(a.id) && !aIsReplacing;
      const bDisabled = alreadyIn.has(b.id) && !bIsReplacing;
      if (aDisabled !== bDisabled) return aDisabled ? -1 : 1;

      const aFav = favIds.has(a.id);
      const bFav = favIds.has(b.id);
      if (aFav !== bFav) return aFav ? -1 : 1;

      const aUse = usage[a.id] ?? 0;
      const bUse = usage[b.id] ?? 0;
      const aUsed = aUse > 0;
      const bUsed = bUse > 0;
      if (aUsed !== bUsed) return aUsed ? -1 : 1;
      if (aUse !== bUse) return bUse - aUse;

      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    return out;
  }, [
    demosOnly,
    combinedOptions,
    props.search,
    props.favoritesOnly,
    favIds,
    usage,
    alreadyIn,
    props.isReplaceMode,
    props.replacingExerciseId,
    props.selectedMuscleId,
    props.selectedEquipment,
  ]);

  const selectedCount = props.selectedIds.length;
  const canConfirm = selectedCount > 0;

  const canCreate = Boolean(props.onCreateExercise);

  function resetCreateForm() {
    setCName("");
    setCEquipment(null);
    setCMuscleIds([]);
    setCInstructions("");
    setCErr(null);
    setCreating(false);
  }

  async function submitCreate() {
    if (!props.onCreateExercise) return;

    const name = cName.trim();
    if (!name) return setCErr("Enter an exercise name.");
    if (!cEquipment) return setCErr("Select equipment.");
    if (cMuscleIds.length < 1) return setCErr("Select at least 1 muscle.");
    if (cMuscleIds.length > 3) return setCErr("Pick up to 3 muscles.");

    setCErr(null);
    setCreating(true);
    Keyboard.dismiss();

    try {
      const created = await props.onCreateExercise({
        name,
        equipment: cEquipment,
        muscleIds: cMuscleIds,
        instructions: cInstructions.trim() ? cInstructions.trim() : null,
      });

      setCreatedOptions((prev) => [created, ...prev]);

      // auto-select it
      if (props.multiSelect) {
        const next = props.selectedIds.includes(created.id) ? props.selectedIds : [...props.selectedIds, created.id];
        props.onChangeSelectedIds(next);
      } else {
        props.onChangeSelectedIds([created.id]);
      }

      setMode("pick");
      resetCreateForm();
    } catch (e: any) {
      setCErr(e?.message ?? "Failed to create exercise.");
    } finally {
      setCreating(false);
    }
  }

  // ---------- CREATE MODE (scrollable + keyboard-safe) ----------
  if (mode === "create") {
    const eqList = props.equipmentOptions ?? [];

    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        {/* Header (true centered title) */}
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, position: "relative" }}>
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setMode("pick");
              resetCreateForm();
            }}
            hitSlop={12}
            style={{ position: "absolute", left: 16, top: 10, paddingVertical: 8, zIndex: 5 }}
          >
            <Text style={{ color: colors.textMuted, fontFamily: typography.fontFamily.semibold }}>Back</Text>
          </Pressable>

          <Text
            style={{
              color: colors.text,
              fontFamily: typography.fontFamily.bold,
              fontSize: 22,
              letterSpacing: -0.4,
              textAlign: "center",
              paddingVertical: 8,
            }}
          >
            Create exercise
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={insets.top + 56}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: insets.bottom + 120, // space for bottom CTA
              gap: 14,
            }}
          >
            {/* Name */}
            <View>
              <Text style={{ color: colors.textMuted, fontFamily: typography.fontFamily.semibold, fontSize: 12, marginBottom: 8 }}>
                Name
              </Text>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 14,
                  backgroundColor: colors.surface ?? colors.bg,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
              >
                <TextInput
                  value={cName}
                  onChangeText={setCName}
                  placeholder="e.g. Special Front Raises"
                  placeholderTextColor={colors.textMuted}
                  style={{ color: colors.text, fontFamily: typography.fontFamily.medium, fontSize: 15 }}
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Description -> instructions */}
            <View>
              <Text style={{ color: colors.textMuted, fontFamily: typography.fontFamily.semibold, fontSize: 12, marginBottom: 8 }}>
                Description (optional)
              </Text>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 14,
                  backgroundColor: colors.surface ?? colors.bg,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
              >
                <TextInput
                  value={cInstructions}
                  onChangeText={setCInstructions}
                  placeholder="Add notes, cues, setup…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={{
                    minHeight: 90,
                    textAlignVertical: "top",
                    color: colors.text,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: 14,
                  }}
                />
              </View>
            </View>

            {/* Muscles */}
            <View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ color: colors.textMuted, fontFamily: typography.fontFamily.semibold, fontSize: 12 }}>
                  Muscles (up to 3)
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={{ color: colors.textMuted, fontFamily: typography.fontFamily.medium, fontSize: 12 }}>
                  {cMuscleIds.length}/3
                </Text>
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {(props.muscleGroups ?? []).map((m) => {
                  const active = cMuscleIds.includes(m.id);
                  const disabled = !active && cMuscleIds.length >= 3;

                  return (
                    <Pill
                      key={m.id}
                      label={m.label}
                      active={active}
                      disabled={disabled}
                      onPress={() => {
                        if (disabled) return;
                        setCMuscleIds((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]));
                      }}
                    />
                  );
                })}
              </View>
            </View>

            {/* Equipment (scrollable because whole form scrolls) */}
            <View>
              <Text style={{ color: colors.textMuted, fontFamily: typography.fontFamily.semibold, fontSize: 12, marginBottom: 8 }}>
                Equipment
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {eqList.map((eq) => {
                  const active = cEquipment === eq;
                  return (
                    <Pill
                      key={eq}
                      label={capFirst(eq)}
                      active={active}
                      onPress={() => setCEquipment(active ? null : eq)}
                    />
                  );
                })}
              </View>
            </View>

            {cErr ? (
              <Text style={{ color: colors.primary, fontFamily: typography.fontFamily.semibold, fontSize: 12 }}>
                {cErr}
              </Text>
            ) : null}

            <View style={{ height: 8 }} />
          </ScrollView>

          {/* Bottom CTA */}
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: insets.bottom + 14,
              backgroundColor: colors.bg,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <Pressable
              disabled={creating}
              onPress={submitCreate}
              style={{
                height: 56,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.primary,
                opacity: creating ? 0.75 : 1,
                flexDirection: "row",
                gap: 10,
              }}
            >
              {creating ? <ActivityIndicator /> : null}
              <Text style={{ color: "#fff", fontFamily: typography.fontFamily.bold, fontSize: 16 }}>
                Create exercise
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ---------- PICK MODE ----------
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {/* Header (true centered title) */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, position: "relative" }}>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            props.onClose();
          }}
          hitSlop={12}
          style={{ position: "absolute", left: 16, top: 10, paddingVertical: 8 }}
        >
          <Text style={{ color: colors.textMuted, fontFamily: typography.fontFamily.semibold }}>Back</Text>
        </Pressable>

        <Text
          style={{
            color: colors.text,
            fontFamily: typography.fontFamily.bold,
            fontSize: 26,
            letterSpacing: -0.6,
            textAlign: "center",
            paddingVertical: 8,
          }}
        >
          {props.title ?? "Select Exercises"}
        </Text>

        <View style={{ position: "absolute", right: 16, top: 10, height: 36, width: 36 }} />
      </View>

      {/* Search + filters */}
      <View style={{ paddingHorizontal: 16 }}>
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 999,
            backgroundColor: colors.surface ?? colors.bg,
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <TextInput
            value={props.search}
            onChangeText={props.onChangeSearch}
            placeholder="Search exercises…"
            placeholderTextColor={colors.textMuted}
            style={{
              flex: 1,
              color: colors.text,
              fontFamily: typography.fontFamily.medium,
              fontSize: 15,
            }}
            returnKeyType="search"
            blurOnSubmit
          />
        </View>

        <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {combinedOptions.some(ex => findExerciseDemo(ex.id)) ? <Pill label="With demos" active={demosOnly} onPress={() => { Keyboard.dismiss(); setDemosOnly(value => !value); }} /> : null}
          <Pill
            label=""
            leftIcon={props.favoritesOnly ? "★" : "☆"}
            active={Boolean(props.favoritesOnly)}
            onPress={() => {
              Keyboard.dismiss();
              props.onToggleFavoritesOnly?.();
            }}
          />

          <Pill
            label={selectedMuscleLabel ?? "Muscle"}
            active={Boolean(props.selectedMuscleId)}
            rightIcon={selectedMuscleLabel ? "×" : "⌄"}
            onPress={() => {
              Keyboard.dismiss();
              if (props.selectedMuscleId) props.onChangeSelectedMuscleId?.(null);
              else setMuscleMenuOpen((v) => !v);
              setEquipmentMenuOpen(false);
            }}
          />

          <Pill
            label={props.selectedEquipment ? capFirst(props.selectedEquipment) : "All Equipment"}
            active={Boolean(props.selectedEquipment)}
            rightIcon={props.selectedEquipment ? "×" : "⌄"}
            onPress={() => {
              Keyboard.dismiss();
              if (props.selectedEquipment) props.onChangeSelectedEquipment?.(null);
              else setEquipmentMenuOpen((v) => !v);
              setMuscleMenuOpen(false);
            }}
          />
        </View>

        {/* Create entry point */}
        {canCreate ? (
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setMode("create");
              resetCreateForm();
            }}
            style={{
              marginTop: 12,
              height: 48,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface ?? colors.bg,
            }}
          >
            <Text style={{ color: colors.text, fontFamily: typography.fontFamily.semibold, fontSize: 14 }}>
              ＋ Create exercise
            </Text>
          </Pressable>
        ) : null}

        {/* Dropdowns */}
        {muscleMenuOpen && (props.muscleGroups?.length ?? 0) > 0 ? (
          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {props.muscleGroups!.map((m) => (
              <Pill
                key={m.id}
                label={m.label}
                active={props.selectedMuscleId === m.id}
                onPress={() => {
                  Keyboard.dismiss();
                  props.onChangeSelectedMuscleId?.(m.id);
                  setMuscleMenuOpen(false);
                }}
              />
            ))}
          </View>
        ) : null}

        {equipmentMenuOpen && (props.equipmentOptions?.length ?? 0) > 0 ? (
          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {props.equipmentOptions!.map((eq) => (
              <Pill
                key={eq}
                label={capFirst(eq)}
                active={props.selectedEquipment === eq}
                onPress={() => {
                  Keyboard.dismiss();
                  props.onChangeSelectedEquipment?.(eq);
                  setEquipmentMenuOpen(false);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(x) => x.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: insets.bottom + 120,
          gap: 10,
        }}
        renderItem={({ item }) => {
          const isReplacing = Boolean(props.isReplaceMode) && props.replacingExerciseId === item.id;
          const disabled = alreadyIn.has(item.id) && !isReplacing;

          const selected = props.selectedIds.includes(item.id);
          const usedCount = usage[item.id] ?? 0;
          const fav = favIds.has(item.id);

          return (
            <CardRow
              item={item}
              disabled={disabled}
              selected={selected}
              usedCount={usedCount}
              fav={fav}
              badgeMuscle={selectedMuscleLabel}
              onToggle={() => toggleId(item.id)}
              onToggleFav={props.onToggleFavorite ? () => props.onToggleFavorite?.(item.id) : undefined}
            />
          );
        }}
      />

      {/* Bottom bar */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: insets.bottom + 14,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <Text style={{ color: colors.textMuted, fontFamily: typography.fontFamily.semibold, fontSize: 12 }}>
            {selectedCount} exercise{selectedCount === 1 ? "" : "s"} selected
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => props.onChangeSelectedIds([])} hitSlop={10}>
            <Text style={{ color: colors.primary, fontFamily: typography.fontFamily.bold, fontSize: 12 }}>
              Clear all
            </Text>
          </Pressable>
        </View>

        <Pressable
          disabled={!canConfirm}
          onPress={() => {
            Keyboard.dismiss();
            props.onConfirm(props.selectedIds);
          }}
          style={{
            height: 56,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: canConfirm ? colors.primary : colors.border,
            opacity: canConfirm ? 1 : 0.65,
          }}
        >
          <Text style={{ color: "#fff", fontFamily: typography.fontFamily.bold, fontSize: 16 }}>
            Confirm selection{selectedCount > 0 ? `  (${selectedCount})` : ""}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
