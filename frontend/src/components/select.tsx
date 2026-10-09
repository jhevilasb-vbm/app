import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing } from "@/src/theme";
import { Sheet } from "@/src/components/feedback";
import { Icon, st } from "@/src/components/ui";

export type Opt = { value: string; label: string; sub?: string };

export function SelectField({ label, value, options, onChange, testID, placeholder = "Selecionar", allowClear = true }: {
  label: string; value?: string | null; options: Opt[]; onChange: (v: string | null, o?: Opt) => void; testID?: string; placeholder?: string; allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sel = options.find((o) => o.value === value);
  const list = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 80), [options, q]);
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.label}>{label}</Text>
      <Pressable testID={testID} onPress={() => setOpen(true)} style={s.field}>
        <Text style={[s.value, !sel && { color: colors.muted }]} numberOfLines={1}>{sel ? sel.label : placeholder}</Text>
        <Icon name="chevron-down" color={colors.muted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.length > 6 && (
          <TextInput testID={`${testID}-search`} value={q} onChangeText={setQ} placeholder="Buscar..." placeholderTextColor={colors.muted} style={s.search} />
        )}
        {allowClear && value ? (
          <Pressable onPress={() => { onChange(null); setOpen(false); }} style={s.opt}><Text style={{ color: colors.errorText }}>Limpar seleção</Text></Pressable>
        ) : null}
        {list.length === 0 && <Text style={st.hint}>Nenhuma opção cadastrada.</Text>}
        {list.map((o) => (
          <Pressable key={o.value} testID={`${testID}-option-${o.value}`} onPress={() => { onChange(o.value, o); setOpen(false); setQ(""); }} style={[s.opt, o.value === value && { borderColor: colors.brand }]}>
            <Text style={s.value}>{o.label}</Text>
            {o.sub ? <Text style={st.hint}>{o.sub}</Text> : null}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  field: { minHeight: 48, flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, gap: spacing.sm },
  value: { flex: 1, color: colors.onSurface, fontSize: 15 },
  search: { minHeight: 44, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, color: colors.onSurface, paddingHorizontal: spacing.md },
  opt: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: "transparent", minHeight: 48, justifyContent: "center" },
});
