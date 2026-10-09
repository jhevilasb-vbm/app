import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useList } from "@/src/api";
import { Badge, Btn, Card, Chips, Empty, ErrorView, Fab, Loading, Muted, Screen, st } from "@/src/components/ui";
import { QUOTE_STATUS, brl, fdate, tone } from "@/src/format";

const FILTERS = [{ value: "all", label: "Todos" }, ...Object.entries(QUOTE_STATUS).map(([value, label]) => ({ value, label }))];

export default function Quotes() {
  const router = useRouter();
  const [f, setF] = useState("all");
  const { data = [], isLoading, isError, refetch, isRefetching } = useList("quotes");
  const list = data.filter((q: any) => f === "all" || q.status === f);
  return (
    <View style={{ flex: 1 }}>
      <Screen title="Orçamentos" back={false} tab refreshing={isRefetching} onRefresh={refetch} testID="quotes-screen"
        right={<Btn testID="open-calculator-button" small variant="secondary" icon="calculator-variant-outline" title="Calculadora" onPress={() => router.push("/calculator")} />}
        sub={<Chips testID="quotes-filter" options={FILTERS} value={f} onChange={setF} />}>
        {isLoading ? <Loading /> : isError ? <ErrorView onRetry={refetch} /> : list.length === 0 ? (
          <Empty icon="file-document-outline" title="Nenhum orçamento" text="Use a calculadora profissional para montar o primeiro orçamento." />
        ) : list.map((q: any) => (
          <Card key={q.id} testID={`quote-card-${q.number}`} onPress={() => router.push(`/quote/${q.id}`)}>
            <View style={st.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.h}>{q.number} · {q.client_name || "Sem cliente"}</Text>
                <Muted>{q.items?.length || 0} item(ns) · {fdate(q.quote_date)} · válido até {fdate(q.valid_until)}</Muted>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={st.h}>{brl(q.total)}</Text>
                <Badge label={QUOTE_STATUS[q.status] || q.status} tone={tone(q.status)} />
              </View>
            </View>
          </Card>
        ))}
      </Screen>
      <Fab testID="new-quote-fab" label="Novo" onPress={() => router.push("/quote-edit")} />
    </View>
  );
}
