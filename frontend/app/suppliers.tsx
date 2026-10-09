import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useList } from "@/src/api";
import { Card, Empty, ErrorView, Fab, Loading, Muted, Screen, st } from "@/src/components/ui";

export default function Suppliers() {
  const router = useRouter();
  const { data = [], isLoading, isError, refetch, isRefetching } = useList("suppliers");
  return (
    <View style={{ flex: 1 }}>
      <Screen title="Fornecedores" refreshing={isRefetching} onRefresh={refetch} testID="suppliers-screen">
        {isLoading ? <Loading /> : isError ? <ErrorView onRetry={refetch} /> : data.length === 0 ? <Empty icon="truck-outline" title="Nenhum fornecedor" /> : data.map((s: any) => (
          <Card key={s.id} testID={`supplier-card-${s.id}`} onPress={() => router.push({ pathname: "/form", params: { col: "suppliers", id: s.id } })}>
            <Text style={st.h}>{s.name}</Text>
            <Muted>{[s.contact, s.phone, s.supplies, s.lead_days ? `${s.lead_days} dias` : null].filter(Boolean).join(" · ") || "—"}</Muted>
          </Card>
        ))}
      </Screen>
      <Fab testID="new-supplier-fab" label="Novo" onPress={() => router.push({ pathname: "/form", params: { col: "suppliers" } })} />
    </View>
  );
}
