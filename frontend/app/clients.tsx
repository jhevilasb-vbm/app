import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useList } from "@/src/api";
import { Badge, Card, Chips, Empty, ErrorView, Fab, Loading, Muted, Screen, st } from "@/src/components/ui";
import { CHANNELS, CLIENT_STAGE } from "@/src/format";
import { colors, radius } from "@/src/theme";

const FILTERS = [{ value: "all", label: "Todos" }, ...Object.entries(CLIENT_STAGE).map(([value, label]) => ({ value, label }))];

export default function Clients() {
  const router = useRouter();
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const { data = [], isLoading, isError, refetch, isRefetching } = useList("clients");
  const list = data.filter((c: any) => (f === "all" || c.stage === f) && (c.name + (c.phone || "") + (c.company || "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={{ flex: 1 }}>
      <Screen title="Clientes" subtitle={`${data.length} cadastrado(s)`} refreshing={isRefetching} onRefresh={refetch} testID="clients-screen"
        sub={<>
          <TextInput testID="clients-search-input" value={q} onChangeText={setQ} placeholder="Buscar por nome, telefone ou empresa" placeholderTextColor={colors.muted}
            style={{ backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderRadius: radius.md, minHeight: 44, paddingHorizontal: 12 }} />
          <Chips testID="clients-filter" options={FILTERS} value={f} onChange={setF} />
        </>}>
        {isLoading ? <Loading /> : isError ? <ErrorView onRetry={refetch} /> : list.length === 0 ? <Empty icon="account-group-outline" title="Nenhum cliente" /> : list.map((c: any) => (
          <Card key={c.id} testID={`client-card-${c.id}`} onPress={() => router.push(`/client/${c.id}`)}>
            <View style={st.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.h}>{c.name}</Text>
                <Muted>{[c.company, c.phone || c.whatsapp, CHANNELS[c.origin] || c.origin].filter(Boolean).join(" · ") || "—"}</Muted>
              </View>
              <Badge label={CLIENT_STAGE[c.stage] || "Novo contato"} tone="brand" />
            </View>
          </Card>
        ))}
      </Screen>
      <Fab testID="new-client-fab" label="Novo" onPress={() => router.push({ pathname: "/form", params: { col: "clients" } })} />
    </View>
  );
}
