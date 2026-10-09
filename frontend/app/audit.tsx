import React from "react";
import { Text } from "react-native";
import { useApi } from "@/src/api";
import { Card, Loading, Muted, Screen, st } from "@/src/components/ui";
import { fdatetime } from "@/src/format";

const ENT: Record<string, string> = { orders: "Pedido", quotes: "Orçamento", materials: "Estoque", transactions: "Financeiro", products: "Produto", clients: "Cliente", jobs: "Produção", purchases: "Compra", settings: "Configurações" };

export default function Audit() {
  const { data = [], isLoading, refetch, isRefetching } = useApi<any[]>("/audit");
  return (
    <Screen title="Histórico de alterações" subtitle="Quem criou ou alterou cada registro" refreshing={isRefetching} onRefresh={refetch} testID="audit-screen">
      {isLoading ? <Loading /> : data.map((a) => (
        <Card key={a.id}>
          <Text style={st.h}>{a.user_name} · {ENT[a.entity] || a.entity}: {a.action}</Text>
          <Muted>{fdatetime(a.at)}{a.summary ? ` · ${a.summary}` : ""}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
