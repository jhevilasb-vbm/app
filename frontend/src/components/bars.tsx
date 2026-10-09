import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/src/theme";
import { brl } from "@/src/format";

type Serie = { key: string; label: string; color: string };
export function BarChart({ data, series, labelKey, testID }: { data: any[]; series: Serie[]; labelKey: string; testID?: string }) {
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Math.abs(Number(d[s.key] || 0)))));
  return (
    <View testID={testID} style={{ gap: spacing.md }}>
      <View style={s.chart}>
        {data.map((d, i) => (
          <View key={i} style={s.group}>
            <View style={s.bars}>
              {series.map((se) => (
                <View key={se.key} style={[s.bar, { height: `${(Math.abs(Number(d[se.key] || 0)) / max) * 100}%`, backgroundColor: se.color }]} />
              ))}
            </View>
            <Text style={s.lbl}>{String(d[labelKey]).slice(5)}/{String(d[labelKey]).slice(2, 4)}</Text>
          </View>
        ))}
      </View>
      <View style={s.legend}>
        {series.map((se) => (
          <View key={se.key} style={s.legItem}>
            <View style={[s.dot, { backgroundColor: se.color }]} />
            <Text style={s.legText}>{se.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function HBars({ items, testID }: { items: { name: string; value: number }[]; testID?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <Text style={s.lbl}>Sem dados no período.</Text>;
  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      {items.map((i) => (
        <View key={i.name} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={s.name} numberOfLines={1}>{i.name}</Text>
            <Text style={s.val}>{brl(i.value)}</Text>
          </View>
          <View style={s.track}><View style={[s.fill, { width: `${(i.value / max) * 100}%` }]} /></View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  chart: { flexDirection: "row", height: 140, alignItems: "flex-end", gap: 6 },
  group: { flex: 1, alignItems: "center", gap: 4, height: "100%" },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 2, width: "100%", justifyContent: "center" },
  bar: { width: 7, borderRadius: 3, minHeight: 2 },
  lbl: { color: colors.muted, fontSize: 10 },
  legend: { flexDirection: "row", gap: spacing.lg, flexWrap: "wrap" },
  legItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legText: { color: colors.onSurfaceTertiary, fontSize: 12 },
  name: { color: colors.onSurfaceTertiary, fontSize: 13, flex: 1 },
  val: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
