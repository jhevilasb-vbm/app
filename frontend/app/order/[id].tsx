import React, { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ApiError, api, invalidateAll, useApi } from "@/src/api";
import { Badge, Btn, Card, Chips, ErrorView, Field, Loading, Muted, Row, Screen, Section, Toggle, st } from "@/src/components/ui";
import { Sheet, useFeedback } from "@/src/components/feedback";
import { CHANNELS, JOB_STATUS, ORDER_STATUS, PAY_STATUS, brl, fdate, fdatetime, parseNum, toStr, today, tone } from "@/src/format";
import { colors } from "@/src/theme";

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { data: o, isLoading, isError, refetch } = useApi<any>(`/orders/${id}/detail`);
  const [sheet, setSheet] = useState<null | "pay" | "inst">(null);
  const [p, setP] = useState({ amount: "", date: today(), method: "Pix", note: "", n: "2", scheduled: false });
  const [busy, setBusy] = useState(false);

  if (isLoading) return <Screen title="Pedido"><Loading /></Screen>;
  if (isError || !o) return <Screen title="Pedido"><ErrorView onRetry={refetch} /></Screen>;

  const run = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      invalidateAll();
      toast(ok);
      return true;
    } catch (e: any) {
      toast(e.message, "error");
      return e;
    }
  };

  const setStatus = async (status: string, force = false): Promise<void> => {
    try {
      await api.post(`/orders/${id}/status`, { status, force });
      invalidateAll();
      toast(`Status: ${ORDER_STATUS[status]}`);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409 && (await confirm({ title: "Confirmar mesmo assim?", message: `${e.message}. Deseja entregar mesmo assim (estoque de acabados não ficará negativo)?`, confirmText: "Confirmar" })))
        return setStatus(status, true);
      if (!(e instanceof ApiError && e.status === 409)) toast(e.message, "error");
    }
  };

  const openPay = (kind: "pay" | "inst") => {
    setP({ ...p, amount: toStr(kind === "pay" ? o.balance : o.unscheduled), scheduled: kind === "inst" });
    setSheet(kind);
  };
  const submitPay = async () => {
    const amount = parseNum(p.amount);
    if (!amount) return toast("Informe o valor", "error");
    setBusy(true);
    const r = await run(() => api.post(`/orders/${id}/payments`, { amount, date: p.date, method: p.method, note: p.note, n: sheet === "inst" ? Number(p.n) || 1 : 1, scheduled: sheet === "inst" || p.scheduled }),
      sheet === "inst" ? "Parcelas a receber criadas" : "Pagamento registrado");
    setBusy(false);
    if (r === true) setSheet(null);
  };
  const remove = async () => {
    if (!(await confirm({ title: "Excluir pedido?", danger: true, confirmText: "Excluir" }))) return;
    if ((await run(() => api.del(`/c/orders/${id}`), "Pedido excluído")) === true) router.back();
  };

  return (
    <Screen title={`Pedido ${o.number}`} subtitle={`${o.client_name || "Sem cliente"} · ${CHANNELS[o.channel] || o.channel}`} testID="order-detail-screen"
      right={<Btn testID="order-edit-button" small variant="secondary" icon="pencil" title="Editar" onPress={() => router.push({ pathname: "/order-edit", params: { id } })} />}>
      <Card>
        <View style={st.listRow}>
          <Text style={[st.h, { flex: 1, fontSize: 26 }]} testID="order-detail-total">{brl(o.total)}</Text>
          <Badge testID="order-payment-status" label={PAY_STATUS[o.payment_status]} tone={tone(o.payment_status)} />
        </View>
        <Row label="Recebido" value={brl(o.paid)} color={colors.successText} testID="order-paid" />
        <Row label="Saldo devedor" value={brl(o.balance)} color={o.balance > 0 ? colors.warningText : undefined} testID="order-balance" />
        {o.scheduled ? <Row label="Parcelas agendadas" value={brl(o.scheduled)} /> : null}
        <Muted>Pedido {fdate(o.order_date)} · Entrega prevista {fdate(o.due_date)}{o.delivered_date ? ` · Entregue ${fdate(o.delivered_date)}` : ""}{o.quote_number ? ` · Orçamento ${o.quote_number}` : ""}</Muted>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Btn testID="order-register-payment-button" small icon="cash-plus" title="Registrar pagamento" onPress={() => openPay("pay")} disabled={o.balance <= 0} /></View>
          <View style={{ flex: 1 }}><Btn testID="order-installments-button" small variant="secondary" icon="calendar-multiple" title="Parcelar saldo" onPress={() => openPay("inst")} disabled={o.unscheduled <= 0} /></View>
        </View>
      </Card>
      <Card>
        <Text style={st.label}>Status de produção / entrega</Text>
        <Chips testID="order-status" options={Object.entries(ORDER_STATUS).map(([value, label]) => ({ value, label }))} value={o.status} onChange={(s) => setStatus(s)} />
        {o.status === "entregue" ? <Muted>Baixa no estoque de produtos acabados realizada.</Muted> : null}
      </Card>
      <Section title="Itens">
        {o.items.map((i: any, k: number) => (
          <Card key={k}>
            <Text style={st.h}>{i.qty}x {i.name}</Text>
            {i.customization ? <Muted>{i.customization}</Muted> : null}
            <Row label="Preço negociado" value={`${brl(i.unit_price)} un. · ${brl(i.total)}`} />
            <Row label="Custo estimado" value={`${brl(i.unit_cost)} un.`} />
          </Card>
        ))}
      </Section>
      <Card>
        <Row label="Subtotal" value={brl(o.subtotal)} />
        {o.discount ? <Row label="Desconto" value={`- ${brl(o.discount)}`} /> : null}
        {o.shipping_charged ? <Row label="Frete cobrado" value={brl(o.shipping_charged)} /> : null}
        <Row label="Total" value={brl(o.total)} bold />
        <Row label="Taxa marketplace" value={brl(o.marketplace_fee)} />
        <Row label="Taxa pagamento" value={brl(o.payment_fee)} />
        <Row label="Custos (produtos + frete pago)" value={brl(o.cost_total)} />
        <Row label="Lucro estimado" value={brl(o.profit)} bold color={o.profit >= 0 ? colors.successText : colors.errorText} />
        <Muted>{o.fees_deducted ? "Taxas descontadas no repasse." : "Taxas geram conta a pagar."} Valor esperado a receber: {brl(o.expected_receipt)}</Muted>
      </Card>
      <Section title="Pagamentos e parcelas">
        {o.transactions.length === 0 ? <Muted>Nenhum pagamento registrado.</Muted> : o.transactions.map((t: any) => (
          <Card key={t.id} testID={`order-tx-${t.id}`}>
            <View style={st.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.h}>{brl(t.amount)}</Text>
                <Muted>{t.description} · {t.paid_date ? `pago ${fdate(t.paid_date)}` : `vence ${fdate(t.due_date)}`} {t.method ? `· ${t.method}` : ""}</Muted>
              </View>
              {t.paid_date ? <Badge label="Recebido" tone="success" /> : (
                <Btn testID={`order-tx-receive-${t.id}`} small title="Receber" onPress={() => run(() => api.post(`/transactions/${t.id}/pay`, {}), "Recebimento registrado")} />
              )}
            </View>
          </Card>
        ))}
      </Section>
      <Section title="Produção" right={<Btn testID="order-generate-jobs-button" small variant="secondary" icon="printer-3d" title="Gerar trabalhos" onPress={() => run(() => api.post(`/orders/${id}/jobs`), "Trabalhos enviados para a fila")} />}>
        {o.jobs.length === 0 ? <Muted>Nenhum trabalho de impressão vinculado.</Muted> : o.jobs.map((j: any) => (
          <Card key={j.id} onPress={() => router.push("/production")}>
            <View style={st.listRow}>
              <Text style={[st.h, { flex: 1 }]}>{j.qty}x {j.product_name}</Text>
              <Badge label={JOB_STATUS[j.status]} tone={tone(j.status)} />
            </View>
            <Muted>{j.printer_name || "Sem impressora"}</Muted>
          </Card>
        ))}
      </Section>
      <Section title="Histórico">
        {o.history.map((h: any) => <Muted key={h.id}>{fdatetime(h.at)} · {h.user_name}: {h.action} {h.summary}</Muted>)}
      </Section>
      <Btn testID="order-delete-button" variant="ghost" icon="delete-outline" title="Excluir pedido" onPress={remove} />

      <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet === "inst" ? "Parcelar saldo a receber" : "Registrar pagamento"}>
        <Field testID="payment-amount-input" label={sheet === "inst" ? "Valor total a parcelar" : "Valor recebido"} value={p.amount} onChangeText={(v) => setP({ ...p, amount: v })} numeric suffix="R$" />
        {sheet === "inst" ? <Field testID="payment-n-input" label="Número de parcelas" value={p.n} onChangeText={(v) => setP({ ...p, n: v })} numeric /> : null}
        <Field testID="payment-date-input" label={sheet === "inst" ? "Vencimento da 1ª parcela" : "Data"} value={p.date} onChangeText={(v) => setP({ ...p, date: v })} placeholder="AAAA-MM-DD" />
        <Field testID="payment-method-input" label="Forma de pagamento" value={p.method} onChangeText={(v) => setP({ ...p, method: v })} />
        {sheet === "pay" ? <Toggle testID="payment-scheduled-toggle" label="Ainda não recebido (agendar)" value={p.scheduled} onChange={(v) => setP({ ...p, scheduled: v })} /> : null}
        <Field testID="payment-note-input" label="Observação (ex.: sinal)" value={p.note} onChangeText={(v) => setP({ ...p, note: v })} />
        <Btn testID="payment-submit-button" title="Confirmar" onPress={submitPay} loading={busy} />
      </Sheet>
    </Screen>
  );
}
