import React from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, invalidateAll, useApi } from "@/src/api";
import { Badge, Btn, Card, Chips, ErrorView, Loading, Muted, Row, Screen, Section, st } from "@/src/components/ui";
import { useFeedback } from "@/src/components/feedback";
import { copyText, exportPDF, quoteHTML, quoteText } from "@/src/export";
import { QUOTE_STATUS, brl, fdate, fdatetime, tone } from "@/src/format";

export default function QuoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { data: q, isLoading, isError, refetch } = useApi<any>(`/c/quotes/${id}`);
  const { data: settings } = useApi<any>("/settings");
  const { data: hist = [] } = useApi<any[]>(`/audit?entity_id=${id}`);
  if (isLoading) return <Screen title="Orçamento"><Loading /></Screen>;
  if (isError || !q) return <Screen title="Orçamento"><ErrorView onRetry={refetch} /></Screen>;

  const setStatus = async (status: string) => {
    if (status === "aprovado") return convert();
    await api.put(`/c/quotes/${id}`, { status });
    if (q.client_id) {
      const stage = { enviado: "orcamento_enviado", aguardando: "aguardando_resposta", recusado: "recusado", rascunho: "orcamento_elaboracao" }[status];
      if (stage) await api.put(`/c/clients/${q.client_id}`, { stage });
    }
    invalidateAll();
    toast("Status atualizado");
  };
  const convert = async () => {
    if (!(await confirm({ title: "Aprovar e converter em pedido?", message: "Os itens, valores e custos deste orçamento serão copiados para um novo pedido." }))) return;
    try {
      const o = await api.post(`/quotes/${id}/convert`);
      invalidateAll();
      toast(`Pedido ${o.number} criado`);
      router.replace(`/order/${o.id}`);
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: "Excluir orçamento?", danger: true, confirmText: "Excluir" }))) return;
    await api.del(`/c/quotes/${id}`);
    invalidateAll();
    router.back();
  };

  return (
    <Screen title={`Orçamento ${q.number}`} subtitle={q.client_name || "Sem cliente"} testID="quote-detail-screen"
      right={!q.order_id ? <Btn testID="quote-edit-button" small variant="secondary" icon="pencil" title="Editar" onPress={() => router.push({ pathname: "/quote-edit", params: { id } })} /> : null}>
      <Card>
        <View style={st.listRow}>
          <Text style={[st.h, { flex: 1, fontSize: 26 }]} testID="quote-detail-total">{brl(q.total)}</Text>
          <Badge testID="quote-status-badge" label={QUOTE_STATUS[q.status] || q.status} tone={tone(q.status)} />
        </View>
        <Muted>Emitido {fdate(q.quote_date)} · válido até {fdate(q.valid_until)} · por {q.created_by}</Muted>
        {q.order_id ? (
          <Btn testID="quote-open-order-button" variant="secondary" icon="shopping" title="Abrir pedido gerado" onPress={() => router.push(`/order/${q.order_id}`)} />
        ) : (
          <>
            <Text style={st.label}>Alterar etapa</Text>
            <Chips testID="quote-status" options={Object.entries(QUOTE_STATUS).map(([value, label]) => ({ value, label }))} value={q.status} onChange={setStatus} />
            <Btn testID="quote-convert-button" icon="check-decagram" title="Aprovar e converter em pedido" onPress={convert} />
          </>
        )}
      </Card>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><Btn testID="quote-copy-whatsapp-button" variant="secondary" icon="whatsapp" title="Copiar texto" onPress={async () => { await copyText(quoteText(q, settings)); toast("Texto copiado para o WhatsApp"); }} /></View>
        <View style={{ flex: 1 }}><Btn testID="quote-pdf-button" variant="secondary" icon="file-pdf-box" title="Gerar PDF" onPress={() => exportPDF(quoteHTML(q, settings)).catch((e) => toast(e.message, "error"))} /></View>
      </View>
      <Section title="Itens">
        {q.items.map((i: any, k: number) => (
          <Card key={k}>
            <Text style={st.h}>{i.qty}x {i.name}</Text>
            {i.customization ? <Muted>{i.customization}</Muted> : null}
            <Row label="Preço unitário" value={brl(i.unit_price)} />
            <Row label="Custo unitário (snapshot)" value={brl(i.unit_cost)} />
            {i.calc ? <Muted>Margem real {i.calc.margin_real_pct}% · {i.calc.printer_name || ""} · {i.calc.print_hours_total} h de impressão</Muted> : null}
          </Card>
        ))}
      </Section>
      <Card>
        <Row label="Subtotal" value={brl(q.subtotal)} />
        <Row label="Desconto" value={brl(q.discount)} />
        <Row label="Total" value={brl(q.total)} bold />
        <Row label="Custo estimado" value={brl(q.cost_total)} />
        <Row label="Lucro estimado" value={brl(q.profit)} />
        <Row label="Sinal" value={brl(q.deposit)} />
        <Row label="Saldo restante" value={brl(q.balance)} />
        <Row label="Prazo de produção" value={`${q.production_days || "—"} dias`} />
        <Muted>Pagamento: {q.payment_terms || "—"}</Muted>
        {q.notes ? <Muted>Obs.: {q.notes}</Muted> : null}
      </Card>
      <Section title="Histórico">
        {hist.map((h: any) => <Muted key={h.id}>{fdatetime(h.at)} · {h.user_name}: {h.action} {h.summary}</Muted>)}
      </Section>
      {!q.order_id ? <Btn testID="quote-delete-button" variant="ghost" icon="delete-outline" title="Excluir orçamento" onPress={remove} /> : null}
    </Screen>
  );
}
