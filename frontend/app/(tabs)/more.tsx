import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Icon, IconName, Screen } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";

const MODULES: { route: string; title: string; icon: IconName; desc: string }[] = [
  { route: "/calculator", title: "Calculadora", icon: "calculator-variant-outline", desc: "Custos e preço" },
  { route: "/production", title: "Produção 3D", icon: "printer-3d", desc: "Fila e agenda" },
  { route: "/clients", title: "Clientes", icon: "account-group-outline", desc: "CRM e contatos" },
  { route: "/products", title: "Catálogo", icon: "shape-outline", desc: "Produtos e fichas" },
  { route: "/inventory", title: "Estoque", icon: "warehouse", desc: "Filamentos e materiais" },
  { route: "/purchases", title: "Compras", icon: "cart-outline", desc: "Lista e fornecedores" },
  { route: "/finance", title: "Financeiro", icon: "cash-multiple", desc: "Contas e caixa" },
  { route: "/reports", title: "Relatórios", icon: "chart-box-outline", desc: "Análises e exportação" },
  { route: "/settings", title: "Configurações", icon: "cog-outline", desc: "Premissas e conta" },
];

export default function More() {
  const router = useRouter();
  return (
    <Screen title="Módulos" subtitle="Tudo da VBM 3D em um lugar" back={false} tab testID="more-screen">
      <View style={s.grid}>
        {MODULES.map((m) => (
          <Pressable key={m.route} testID={`module-${m.route.slice(1)}`} onPress={() => router.push(m.route as any)} style={({ pressed }) => [s.card, pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] }]}>
            <View style={s.icon}><Icon name={m.icon} size={24} color={colors.brand} /></View>
            <Text style={s.title}>{m.title}</Text>
            <Text style={s.desc}>{m.desc}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.md },
  card: { width: "48.5%", aspectRatio: 1.15, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, justifyContent: "flex-end", gap: 4 },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: "auto" },
  title: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  desc: { color: colors.muted, fontSize: 12 },
});
