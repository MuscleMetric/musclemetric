import React from "react";
import { Text, View } from "react-native";
import { useAppTheme } from "@/lib/useAppTheme";
import { Card } from "@/ui";
import { HistorySectionHeader } from "@/app/features/history/ui/HistorySectionHeader";

export function WorkoutDetailCard({ title, subtitle, metrics, children, right }: {
  title: string; subtitle?: string; metrics: string[][]; children?: React.ReactNode; right?: React.ReactNode;
}) {
  const { colors, typography } = useAppTheme();
  return <Card style={{ padding: 14, borderRadius: 18, gap: 10 }}>
    <HistorySectionHeader title={title} subtitle={subtitle} right={right} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 10 }}>
      {metrics.map(([label, value]) => <View key={label} style={{ width: "50%" }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: colors.text, fontFamily: typography.fontFamily.bold, fontSize: 16 }}>{value}</Text>
      </View>)}
    </View>
    {children}
  </Card>;
}
