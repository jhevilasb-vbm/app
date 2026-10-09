import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api, invalidateAll, useApi, useList } from "@/src/api";
import { Badge, Btn, Card, Chips, Empty, ErrorView, Fab, Field, Loading, Muted, Row, Screen, Section, Toggle, st } from "@/src/components/ui";
import { Sheet, useFeedback } from "@/src/components/feedback";
import { PURCHASE_STATUS, brl, fnum, parseNum, toStr, today, tone } from "@/src/format";

const NEXT: Record<string, string> = { planejado: "aprovado", aprovado: "comprado", comprado: "recebido" };

export default function Purchases() {
  const router = useRouter();
  const { toast } = useFeedback();
  const [f, setF] = useState("open");
  const { data = [], isLoading, isError, refetch, isRefetching } = useList("purchases");
  const { data: sugg = [] } = useApi<any[]>("/purchases/suggestions");
  const { data: suppliers = [] } = useList("suppliers");
  const [buy, setBuy] = useState<any>(null);
  const [b, setB] = useState({ unit_price: "", paid: true, due_date: today(), status: "comprado" });
  const supName = (id: string) => suppliers.find((x: any) => x.id === id)?.name;
  const list = data.filter((p: any) => (f === "open" ? p.status !== "recebido" : f === "all" || p.status === f));
  const prio = { alta: 0, media: 1, baixa: 2 } as Record<string, number>;
  list.sort((a: any, c: any) => (prio[a.priority] ?? 1) - (prio[c.priority] ?? 1));
  const total = data.filter((p: any) => p.status !== "recebido").reduce((a: number, p: any) => a + (p.qty || 0) * (p.est_unit_price || 0), 0);

  const advance = async (p: any) => {
    const next = NEXT[p.status];
    if (next === "comprado" || (next === "recebido" && !p.transaction_id)) {
      setB({ unit_price: toStr(p.unit_price ?? p.est_unit_price), paid: true, due_date: today(), status: next });
      return setBuy(p);
    }
    try {
      await api.post(`/purchases/${p.id}/status`, { status: next });
      invalidateAll();
      toast(next === "recebido" ? "Recebido · estoque atualizado" : `Status: ${PURCHASE_STATUS[next]}`);
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const submitBuy = async () => {
    try {
      await api.post(`/purchases/${buy.id}/status`, { status: b.status, paid: b.paid, due_date: b.due_date, unit_price: parseNum(b.unit_price) });
      invalidateAll();
      setBuy(null);
      toast(b.status === "recebido" ? "Recebido · estoque e despesa registrados" : "Compra registrada no financeiro");
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const addSugg = async (s: any) => {
    await api.post("/c/purchases", { name: s.name, material_id: s.material_id, qty: s.suggested_qty, est_unit_price: s.est_unit_price, supplier_id: s.supplier_id, reason: s.reason, status: "planejado", priority: "alta" });
    invalidateAll();
    toast("Adicionado à lista");
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Compras" subtitle={`Lista em aberto: ${brl(total)}`} refreshing={isRefetching} onRefresh={refetch} testID="purchases-screen"
        right={<Btn testID="suppliers-button" small variant="secondary" icon="truck-outline" title="Fornecedores" onPress={() => router.push("/suppliers")} />}
        sub={<Chips testID="purchases-filter" value={f} onChange={setF} options={[{ value: "open", label: "Em aberto" }, ...Object.entries(PURCHASE_STATUS).map(([value, label]) => ({ value, label })), { value: "all", label: "Todos" }]} />}>
        {sugg.length ? (
          <Section title="Sugestões de reposição">
            {sugg.map((s: any) => (
              <Card key={s.material_id} testID={`suggestion-${s.material_id}`}>
                <View style={st.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.h}>{s.name}</Text>
                    <Muted>{s.reason} · atual {fnum(s.qty_now)} {s.unit} · sugerido {fnum(s.suggested_qty)} {s.unit}</Muted>
                  </View>
                  <Btn testID={`suggestion-add-${s.material_id}`} small title="Adicionar" onPress={() => addSugg(s)} />
                </View>
              </Card>
            ))}
          </Section>
        ) : null}
        <Section title="Lista de compras">
          {isLoading ? <Loading /> : isError ? <ErrorView onRetry={refetch} /> : list.length === 0 ? <Empty icon="cart-outline" title="Lista vazia" /> : list.map((p: any) => (
            <Card key={p.id} testID={`purchase-card-${p.id}`} onPress={() => router.push({ pathname: "/form", params: { col: "purchases", id: p.id } })}>
              <View style={st.listRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={st.h}>{p.name}</Text>
                  <Muted>{fnum(p.qty, 1)} {p.unit || ""} · {brl((p.qty || 0) * (p.unit_price ?? p.est_unit_price ?? 0))}{supName(p.supplier_id) ? ` · ${supName(p.supplier_id)}` : ""}</Muted>
                  {p.reason ? <Muted>{p.reason}</Muted> : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Badge label={PURCHASE_STATUS[p.status]} tone={tone(p.status)} />
                  {p.priority === "alta" ? <Badge label="Prioridade" tone="error" /> : null}
                </View>
              </View>
              {NEXT[p.status] ? <Btn testID={`purchase-advance-${p.id}`} small variant="secondary" title={`Marcar como ${PURCHASE_STATUS[NEXT[p.status]].toLowerCase()}`} onPress={() => advance(p)} /> : null}
            </Card>
          ))}
        </Section>
      </Screen>
      <Fab testID="new-purchase-fab" label="Item" onPress={() => router.push({ pathname: "/form", params: { col: "purchases" } })} />
      <Sheet visible={!!buy} onClose={() => setBuy(null)} title={`Registrar compra: ${buy?.name || ""}`}>
        <Field testID="buy-unit-price-input" label="Preço real por unidade" value={b.unit_price} onChangeText={(x) => setB({ ...b, unit_price: x })} numeric suffix="R$" />
        <Row label="Total" value={brl((buy?.qty || 0) * (parseNum(b.unit_price) || 0))} bold />
        <Toggle testID="buy-paid-toggle" label="Já foi pago" value={b.paid} onChange={(x) => setB({ ...b, paid: x })} />
        <Field testID="buy-due-date-input" label={b.paid ? "Data do pagamento" : "Vencimento"} value={b.due_date} onChangeText={(x) => setB({ ...b, due_date: x })} placeholder="AAAA-MM-DD" />
        <Muted>Uma única despesa será lançada no financeiro. Ao receber, o estoque é atualizado sem duplicar o lançamento.</Muted>
        <Btn testID="buy-submit-button" title="Confirmar" onPress={submitBuy} />
      </Sheet>
    </View>
  );
}
