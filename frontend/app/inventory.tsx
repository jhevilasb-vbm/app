import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useList } from "@/src/api";
import { Badge, Btn, Card, Chips, Empty, ErrorView, Fab, Loading, Muted, Screen, st } from "@/src/components/ui";
import { MATERIAL_KIND, brl, fnum } from "@/src/format";

const FILTERS = [{ value: "all", label: "Todos" }, { value: "low", label: "Estoque baixo" }, { value: "filamento", label: "Filamentos" },
  { value: "consumivel", label: "Consumíveis" }, { value: "embalagem", label: "Embalagens" }, { value: "ferramenta", label: "Ferramentas" }];

export default function Inventory() {
  const router = useRouter();
  const [f, setF] = useState("all");
  const { data = [], isLoading, isError, refetch, isRefetching } = useList("materials");
  const list = data.filter((m: any) => f === "all" || (f === "low" ? m.low : m.kind === f));
  const value = data.reduce((a: number, m: any) => a + (m.qty || 0) * (m.avg_cost || 0), 0);
  return (
    <View style={{ flex: 1 }}>
      <Screen title="Estoque" subtitle={`Valor em estoque: ${brl(value)}`} refreshing={isRefetching} onRefresh={refetch} testID="inventory-screen"
        right={<Btn testID="inventory-finished-button" small variant="secondary" icon="package-variant" title="Acabados" onPress={() => router.push("/products")} />}
        sub={<Chips testID="inventory-filter" options={FILTERS} value={f} onChange={setF} />}>
        {isLoading ? <Loading /> : isError ? <ErrorView onRetry={refetch} /> : list.length === 0 ? <Empty icon="warehouse" title="Nenhum item" text="Cadastre filamentos, argolas, embalagens e ferramentas." /> : list.map((m: any) => (
          <Card key={m.id} testID={`material-card-${m.id}`} onPress={() => router.push(`/material/${m.id}`)}>
            <View style={st.listRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={st.h}>{m.name}</Text>
                <Muted>{MATERIAL_KIND[m.kind] || m.kind} · {m.unit === "g" ? `${brl((m.avg_cost || 0) * 1000)}/kg` : `${brl(m.avg_cost)}/${m.unit}`}{m.location ? ` · ${m.location}` : ""}</Muted>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={st.h} testID={`material-qty-${m.id}`}>{fnum(m.qty, m.unit === "g" ? 0 : 1)} {m.unit}</Text>
                {m.low ? <Badge label="Estoque baixo" tone="warning" /> : null}
              </View>
            </View>
          </Card>
        ))}
      </Screen>
      <Fab testID="new-material-fab" label="Novo" onPress={() => router.push({ pathname: "/form", params: { col: "materials" } })} />
    </View>
  );
}
