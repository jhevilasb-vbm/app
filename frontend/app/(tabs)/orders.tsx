import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useApi } from "@/src/api";
import { Badge, Card, Chips, Empty, ErrorView, Fab, Loading, Muted, Screen, st } from "@/src/components/ui";
import { CHANNELS, ORDER_STATUS, PAY_STATUS, brl, fdate, tone } from "@/src/format";

const FILTERS = [
  { value: "open", label: "Em aberto" }, { value: "late", label: "Atrasados" }, { value: "em_producao", label: "Em produção" },
  { value: "pronto", label: "Prontos" }, { value: "entregue", label: "Entregues" }, { value: "receber", label: "A receber" }, { value: "all", label: "Todos" },
];

export default function Orders() {
  const router = useRouter();
  const [f, setF] = useState("open");
  const { data = [], isLoading, isError, refetch, isRefetching } = useApi<any[]>("/orders/summary");
  const list = data.filter((o: any) => {
    if (f === "all") return true;
    if (f === "open") return ["confirmado", "em_producao", "pronto"].includes(o.status);
    if (f === "late") return o.late;
    if (f === "receber") return o.balance > 0;
    return o.status === f;
  });
  return (
    <View style={{ flex: 1 }}>
      <Screen title="Pedidos e vendas" back={false} tab refreshing={isRefetching} onRefresh={refetch} testID="orders-screen"
        sub={<Chips testID="orders-filter" options={FILTERS} value={f} onChange={setF} />}>
        {isLoading ? <Loading /> : isError ? <ErrorView onRetry={refetch} /> : list.length === 0 ? (
          <Empty icon="shopping-outline" title="Nenhum pedido aqui" text="Crie um pedido ou converta um orçamento aprovado." />
        ) : list.map((o: any) => (
          <Card key={o.id} testID={`order-card-${o.number}`} onPress={() => router.push(`/order/${o.id}`)}>
            <View style={st.listRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={st.h}>{o.number} · {o.client_name || "Sem cliente"}</Text>
                <Muted>{CHANNELS[o.channel] || o.channel} · entrega {fdate(o.due_date)}</Muted>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <Badge label={ORDER_STATUS[o.status]} tone={tone(o.status)} />
                  <Badge label={PAY_STATUS[o.payment_status]} tone={tone(o.payment_status)} />
                  {o.late ? <Badge label="Atrasado" tone="error" /> : null}
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={st.h}>{brl(o.total)}</Text>
                {o.balance > 0 ? <Muted>saldo {brl(o.balance)}</Muted> : null}
              </View>
            </View>
          </Card>
        ))}
      </Screen>
      <Fab testID="new-order-fab" label="Novo" onPress={() => router.push("/order-edit")} />
    </View>
  );
}
