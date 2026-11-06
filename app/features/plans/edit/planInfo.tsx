// app/features/plans/edit/planInfo.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useEditPlan } from "./store";
import { useAppTheme } from "../../../../lib/useAppTheme";

import { ScreenHeader, Icon } from "@/ui";

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PlanInfo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, typography, layout } = useAppTheme() as any;
  const s = useMemo(
    () => makeStyles(colors, typography, layout),
    [colors, typography, layout]
  );

  const { title, endDate, setMeta } = useEditPlan();

  // local edit buffer (so we don't mutate store until Save)
  const [localTitle, setLocalTitle] = useState(title ?? "");
  const [localEndDate, setLocalEndDate] = useState<string | null>(endDate);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tmpDate, setTmpDate] = useState(
    endDate ? new Date(endDate) : new Date()
  );

  const isDirty =
    localTitle.trim() !== (title ?? "").trim() || localEndDate !== endDate;

  function onSave() {
    setMeta({
      title: localTitle.trim(),
      endDate: localEndDate,
    });
    router.back();
  }

  const footerH = 86 + insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Plan Info"
        showBack={true}
        right={
          <View style={{ width: 44, alignItems: "flex-end" }}>
            {isDirty ? (
              <View style={s.dirtyPill}>
                <Text numberOfLines={1} style={s.dirtyPillText}>
                  Edited
                </Text>
              </View>
            ) : (
              <Icon name="checkmark-circle" size={18} color={colors.success} />
            )}
          </View>
        }
      />

      <View style={{ flex: 1, paddingBottom: footerH }}>
        <View style={s.page}>
          <View style={s.headerBlock}>
            <Text style={s.h1}>Plan settings</Text>
            <Text style={s.sub}>
              Update the core details. Changes won’t apply until you save.
            </Text>
          </View>

          <View style={s.card}>
            {/* Title */}
            <View style={s.field}>
              <Text style={s.label}>Plan title</Text>
              <View style={s.inputWrap}>
                <Icon
                  name="create-outline"
                  size={18}
                  color={colors.textMuted}
                />
                <TextInput
                  testID="plan-edit-title"
                value={localTitle}
                  onChangeText={setLocalTitle}
                  placeholder="e.g. Hypertrophy Block"
                  placeholderTextColor={colors.textMuted}
                  style={s.input}
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={s.divider} />

            {/* End date */}
            <View style={s.field}>
              <Text style={s.label}>End date</Text>

              <Pressable
                style={({ pressed }) => [
                  s.dateRow,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => {
                  setTmpDate(
                    localEndDate ? new Date(localEndDate) : new Date()
                  );
                  setShowDatePicker(true);
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Icon
                    name="calendar-outline"
                    size={18}
                    color={colors.textMuted}
                  />
                  <View>
                    <Text style={s.dateText}>
                      {localEndDate ? fmtDate(localEndDate) : "Select end date"}
                    </Text>
                    <Text style={s.dateHint}>
                      {localEndDate ? "Tap to change" : "Required"}
                    </Text>
                  </View>
                </View>

                <Icon
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>

            {isDirty ? (
              <View style={s.notice}>
                <Icon
                  name="alert-circle-outline"
                  size={18}
                  color={colors.warning}
                />
                <Text style={s.noticeText}>You have unsaved changes.</Text>
              </View>
            ) : (
              <View style={s.noticeOk}>
                <Icon
                  name="information-circle-outline"
                  size={18}
                  color={colors.textMuted}
                />
                <Text style={s.noticeOkText}>No changes yet.</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Sticky footer */}
      <View
        style={[
          s.footer,
          { paddingBottom: insets.bottom + (layout?.space?.md ?? 16) },
        ]}
      >
        <View style={{ flexDirection: "row", gap: layout?.space?.sm ?? 10 }}>
          <Pressable style={s.footerBtnGhost} onPress={() => router.back()}>
            <Text style={s.footerGhostText}>Cancel</Text>
          </Pressable>

          <Pressable
            style={[s.footerBtnPrimary, !isDirty && { opacity: 0.55 }]}
            disabled={!isDirty}
            onPress={onSave}
          >
            <Text style={s.footerPrimaryText}>Save changes</Text>
          </Pressable>
        </View>
      </View>

      {/* Date picker modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={s.modalScrim}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Select end date</Text>

            <View style={s.pickerShell}>
              <DateTimePicker
                value={tmpDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={(_, d) => d && setTmpDate(d)}
                style={s.picker} // ✅ important
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable
                style={s.modalBtn}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={s.modalBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[s.modalBtn, s.modalBtnPrimary]}
                onPress={() => {
                  const yyyy_mm_dd = new Date(
                    tmpDate.getTime() - tmpDate.getTimezoneOffset() * 60000
                  )
                    .toISOString()
                    .slice(0, 10);

                  setLocalEndDate(yyyy_mm_dd);
                  setShowDatePicker(false);
                }}
              >
                <Text style={s.modalBtnPrimaryText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any, typography: any, layout: any) =>
  StyleSheet.create({
    page: {
      flex: 1,
      paddingHorizontal: layout?.space?.lg ?? 18,
      paddingTop: layout?.space?.lg ?? 18,
      gap: layout?.space?.lg ?? 18,
    },

    headerBlock: {
      gap: 6,
      paddingHorizontal: 2,
    },
    h1: {
      color: colors.text,
      fontFamily: typography?.fontFamily?.bold ?? undefined,
      fontWeight: "900",
      fontSize: 22,
      letterSpacing: -0.3,
    },
    sub: {
      color: colors.textMuted ?? colors.subtle,
      fontFamily: typography?.fontFamily?.medium ?? undefined,
      fontSize: 13,
      lineHeight: 18,
    },

    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: layout?.space?.lg ?? 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: layout?.space?.lg ?? 16,
    },

    field: { gap: 10 },

    label: {
      color: colors.textMuted ?? colors.subtle,
      fontSize: 12,
      letterSpacing: 0.8,
      fontWeight: "800",
      textTransform: "uppercase",
    },

    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
    },

    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      opacity: 0.9,
    },

    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    dateText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "800",
    },
    dateHint: {
      marginTop: 2,
      color: colors.textMuted ?? colors.subtle,
      fontSize: 12,
      fontWeight: "600",
    },

    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    noticeText: {
      color: colors.text,
      fontWeight: "700",
      flex: 1,
    },

    noticeOk: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    noticeOkText: {
      color: colors.textMuted ?? colors.subtle,
      fontWeight: "700",
      flex: 1,
    },

    dirtyPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.primaryBg ?? colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      flexShrink: 0,
    },
    dirtyPillText: {
      color: colors.primaryText ?? colors.primary,
      fontWeight: "900",
      fontSize: 11,
      letterSpacing: 0.3,
      width: 35,
    },

    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: layout?.space?.lg ?? 18,
      paddingTop: 12,
      backgroundColor: colors.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footerBtnGhost: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    footerGhostText: {
      color: colors.text,
      fontWeight: "900",
    },
    footerBtnPrimary: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.primary,
    },
    footerPrimaryText: {
      color: colors.onPrimary ?? "#fff",
      fontWeight: "900",
    },

    modalScrim: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)", // ✅ darker scrim (less “transparent” feel)
      justifyContent: "flex-end",
    },

    modalCard: {
      backgroundColor: colors.surface,
      padding: 16,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },

    pickerShell: {
      backgroundColor: colors.surface ?? colors.card, // ✅ solid block behind picker
      borderRadius: 14,
      overflow: "hidden", // ✅ clips iOS picker so it doesn’t show through
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: 10,
    },

    picker: {
      backgroundColor: colors.surface ?? colors.card, // ✅ forces non-transparent picker background
    },

    modalTitle: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 16,
      marginBottom: 10,
    },
    modalBtn: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    modalBtnText: {
      color: colors.text,
      fontWeight: "900",
    },
    modalBtnPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    modalBtnPrimaryText: {
      color: colors.onPrimary ?? "#fff",
      fontWeight: "900",
    },
  });
