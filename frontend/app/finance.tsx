import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api, invalidateAll, useApi, useList } from "@/src/api";
import { Badge, Btn, Card, Chips, Empty, ErrorView, Field, Grid, KPI, Loading, Muted, Row, Screen, Section, st } from "@/src/components/ui";
import { BarChart, HBars } from "@/src/components/bars";
import { Sheet, useFeedback } from "@/src/components/feedback";
import { CHANNELS, PERIODS, TX_STATUS, TX_TYPE, brl, fdate, parseNum, periodRange, today, tone } from "@/src/format";
import { colors } from "@/src/theme";

const LF = [{ value: "pagar", label: "A pagar" }, { value: "receber", label: "A receber" }, { value: "vencido", label: "Vencidas" },
  { value: "pago", label: "Pagas/recebidas" }, { value: "socios", label: "Aportes/retiradas" }, { value: "pessoal", label: "Pessoal" }, { value: "all", label: "Todas" }];

export default function Finance() {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [seg, setSeg] = useState("resumo");
  const [lf, setLf] = useState("pagar");
  const [period, setPeriod] = useState("month");
  const { start, end } = periodRange(period);
  const ov = useApi<any>("/finance/overview");
  const txs = useList("transactions");
  const dre = useApi<any>(seg === "dre" ? `/reports?start=${start}&end=${end}` : null);
  const recs = useApi<any[]>("/finance/reconciliations");
  const [sheet, setSheet] = useState<null | "batch" | "recon">(null);
  const [bt, setBt] = useState({ description: "", category: "", total: "", n: "10", first: today(), mode: "parcelado" });
  const [rc, setRc] = useState({ counted: "", note: "" });
  const { data: cats = [] } = useList("categories");

  const list = (txs.data || []).filter((t: any) => {
    if (lf === "pessoal") return t.scope === "pessoal";
    if (t.scope === "pessoal") return false;
    if (lf === "pagar") return t.type === "despesa" && !t.paid_date;
    if (lf === "receber") return t.type === "receita" && !t.paid_date;
    if (lf === "vencido") return t.status === "vencido";
    if (lf === "pago") return !!t.paid_date;
    if (lf === "socios") return ["aporte", "retirada"].includes(t.type);
    return true;
  }).sort((a: any, b: any) => (a.due_date || "").localeCompare(b.due_date || ""));

  const pay = async (t: any) => {
    try {
      await api.post(`/transactions/${t.id}/${t.paid_date ? "unpay" : "pay"}`, {});
      invalidateAll();
      toast(t.paid_date ? "Baixa estornada" : "Baixa registrada");
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const submitBatch = async () => {
    const total = parseNum(bt.total);
    if (!bt.description || !total) return toast("Preencha descrição e valor", "error");
    try {
      await api.post("/transactions/batch", { base: { type: "despesa", description: bt.description, category: bt.category || null }, mode: bt.mode, total_amount: total, n: Number(bt.n) || 1, first_due: bt.first });
      invalidateAll();
      setSheet(null);
      toast(bt.mode === "parcelado" ? "Parcelas geradas" : "Recorrências geradas");
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const submitRecon = async () => {
    const counted = parseNum(rc.counted);
    if (counted === null) return toast("Informe o saldo contado", "error");
    if (!(await confirm({ title: "Conciliar caixa?", message: `Saldo no sistema: ${brl(ov.data?.balance)}. Diferença: ${brl(counted - (ov.data?.balance || 0))}. Um lançamento de ajuste será criado se houver diferença.` }))) return;
    await api.post("/finance/reconcile", { counted_balance: counted, note: rc.note });
    invalidateAll();
    setSheet(null);
    toast("Caixa conciliado");
  };
  const o = ov.data;
  const r = dre.data?.summary;

  return (
    <Screen title="Financeiro" subtitle="Caixa, contas e resultado" refreshing={ov.isRefetching} onRefresh={() => { ov.refetch(); txs.refetch(); }} testID="finance-screen"
      sub={<Chips testID="finance-segment" value={seg} onChange={setSeg} options={[{ value: "resumo", label: "Resumo" }, { value: "lanc", label: "Lançamentos" }, { value: "dre", label: "Resultado (DRE)" }]} />}>
      {seg === "resumo" && (ov.isLoading ? <Loading /> : ov.isError ? <ErrorView onRetry={ov.refetch} /> : (
        <>
          {o.initial_balance == null ? <Notice2 text="Saldo inicial não cadastrado. Informe em Configurações para o saldo refletir a realidade." /> : null}
          <Grid>
            <KPI testID="fin-balance" icon="bank-outline" label="Saldo disponível" value={brl(o.balance)} sub="Somente valores efetivamente pagos/recebidos" />
            <KPI testID="fin-overdue" icon="alert-circle-outline" label="Contas vencidas" value={brl(o.overdue_total)} sub={`${o.overdue_count} conta(s)`} color={o.overdue_count ? colors.errorText : undefined} />
            <KPI testID="fin-due-7" icon="calendar-week" label="Próximos 7 dias" value={brl(o.due_7)} />
            <KPI testID="fin-due-15" icon="calendar-range" label="Próximos 15 dias" value={brl(o.due_15)} />
            <KPI testID="fin-due-30" icon="calendar-month" label="Próximos 30 dias" value={brl(o.due_30)} />
            <KPI testID="fin-receivables" icon="cash-clock" label="A receber" value={brl(o.receivables_total)} color={colors.warningText} />
          </Grid>
          {o.cash_need > 0 ? <Notice2 text={`Necessidade de caixa: faltam ${brl(o.cash_need)} para cobrir as contas dos próximos 30 dias.`} /> : null}
          <Card>
            <Section title="Fluxo de caixa projetado">
              <BarChart testID="fin-projection-chart" data={o.projection} labelKey="month" series={[{ key: "in", label: "Entradas previstas", color: colors.success }, { key: "out", label: "Saídas previstas", color: colors.error }]} />
              {o.projection.map((p: any) => <Row key={p.month} label={p.month} value={`saldo ${brl(p.balance)}`} color={p.balance < 0 ? colors.errorText : undefined} />)}
            </Section>
          </Card>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Btn testID="fin-reconcile-button" variant="secondary" icon="scale-balance" title="Conciliar caixa" onPress={() => setSheet("recon")} /></View>
            <View style={{ flex: 1 }}><Btn testID="fin-batch-button" variant="secondary" icon="calendar-multiple" title="Parcelada" onPress={() => setSheet("batch")} /></View>
          </View>
          {(recs.data || []).slice(0, 3).map((x: any) => <Muted key={x.id}>Conciliação {fdate(x.date)} por {x.created_by}: contado {brl(x.counted_balance)} · diferença {brl(x.diff)}</Muted>)}
        </>
      ))}

      {seg === "lanc" && (
        <>
          <Chips testID="fin-list-filter" value={lf} onChange={setLf} options={LF} />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Btn testID="fin-new-expense-button" small icon="minus" title="Despesa" onPress={() => router.push({ pathname: "/form", params: { col: "transactions", preset: JSON.stringify({ type: "despesa" }) } })} />
            <Btn testID="fin-new-income-button" small variant="secondary" icon="plus" title="Receita" onPress={() => router.push({ pathname: "/form", params: { col: "transactions", preset: JSON.stringify({ type: "receita" }) } })} />
            <Btn testID="fin-new-partner-button" small variant="secondary" icon="account-cash" title="Aporte/Retirada" onPress={() => router.push({ pathname: "/form", params: { col: "transactions", preset: JSON.stringify({ type: "aporte", category: "Sócios" }) } })} />
            <Btn testID="fin-new-batch-button" small variant="secondary" icon="calendar-multiple" title="Parcelada/Recorrente" onPress={() => setSheet("batch")} />
          </View>
          {txs.isLoading ? <Loading /> : list.length === 0 ? <Empty icon="cash-multiple" title="Nenhum lançamento" /> : list.map((t: any) => (
            <Card key={t.id} testID={`tx-card-${t.id}`} onPress={() => router.push({ pathname: "/form", params: { col: "transactions", id: t.id } })}>
              <View style={st.listRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={st.h} numberOfLines={1}>{t.description}</Text>
                  <Muted>{TX_TYPE[t.type]} · {t.category || "Sem categoria"} · {t.paid_date ? `pago ${fdate(t.paid_date)}` : `vence ${fdate(t.due_date)}`}</Muted>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={[st.h, { color: ["receita", "aporte"].includes(t.type) ? colors.successText : colors.onSurface }]}>{["receita", "aporte"].includes(t.type) ? "+" : "−"}{brl(t.amount)}</Text>
                  <Badge label={TX_STATUS[t.status]} tone={tone(t.status)} />
                </View>
              </View>
              <Btn testID={`tx-pay-${t.id}`} small variant={t.paid_date ? "ghost" : "secondary"} title={t.paid_date ? "Estornar baixa" : t.type === "receita" ? "Marcar recebido" : "Marcar pago"} onPress={() => pay(t)} />
            </Card>
          ))}
        </>
      )}

      {seg === "dre" && (
        <>
          <Chips testID="fin-dre-period" options={PERIODS} value={period} onChange={setPeriod} />
          {dre.isLoading || !r ? <Loading /> : (
            <>
              <Card>
                <Section title={`Resultado econômico ${fdate(start)} a ${fdate(end)}`}>
                  <Row label="Faturamento (vendas)" value={brl(r.revenue)} />
                  <Row label="(−) Taxas de venda" value={brl(r.fees)} />
                  <Row label="(−) Custo dos produtos vendidos" value={brl(r.cogs)} />
                  <Row label="= Lucro bruto" value={brl(r.gross_profit)} bold />
                  <Row label="(−) Despesas operacionais" value={brl(r.opex)} />
                  <Row label="= Lucro líquido estimado" value={brl(r.net_profit)} bold color={r.net_profit >= 0 ? colors.successText : colors.errorText} testID="dre-net-profit" />
                  <Muted>Compras de estoque, energia, parcelas da impressora e taxas já entram no custo de produção e não são contadas duas vezes (ajuste em Configurações › Categorias). Aportes não são faturamento.</Muted>
                </Section>
              </Card>
              <Card>
                <Section title="Fluxo de caixa (efetivo)">
                  <Row label="Recebido de clientes/receitas" value={brl(r.received)} color={colors.successText} />
                  <Row label="Pago (despesas)" value={brl(r.paid_out)} color={colors.errorText} />
                  <Row label="Saldo do período" value={brl(r.received - r.paid_out)} bold />
                </Section>
              </Card>
              <Card><Section title="Despesas por categoria"><HBars items={dre.data.expenses_by_category} /></Section></Card>
              <Card><Section title="Faturamento por canal"><HBars items={dre.data.revenue_by_channel.map((x: any) => ({ ...x, name: CHANNELS[x.name] || x.name }))} /></Section></Card>
              <Card><Section title="Lucro estimado por produto"><HBars items={dre.data.products.map((x: any) => ({ name: x.name, value: x.profit }))} /></Section></Card>
            </>
          )}
        </>
      )}

      <Sheet visible={sheet === "batch"} onClose={() => setSheet(null)} title="Despesa parcelada ou recorrente">
        <Chips testID="batch-mode" value={bt.mode} onChange={(x) => setBt({ ...bt, mode: x })} options={[{ value: "parcelado", label: "Parcelada (divide o total)" }, { value: "recorrente", label: "Recorrente (repete o valor)" }]} />
        <Field testID="batch-description-input" label="Descrição" value={bt.description} onChangeText={(x) => setBt({ ...bt, description: x })} placeholder="Ex.: Bambu Lab A1" />
        <Chips testID="batch-category" value={bt.category} onChange={(x) => setBt({ ...bt, category: x })} options={cats.map((c: any) => ({ value: c.name, label: c.name }))} />
        <Field testID="batch-total-input" label={bt.mode === "parcelado" ? "Valor total" : "Valor de cada mês"} value={bt.total} onChangeText={(x) => setBt({ ...bt, total: x })} numeric suffix="R$" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Field flex testID="batch-n-input" label={bt.mode === "parcelado" ? "Parcelas" : "Meses"} value={bt.n} onChangeText={(x) => setBt({ ...bt, n: x })} numeric />
          <Field flex testID="batch-first-input" label="1º vencimento" value={bt.first} onChangeText={(x) => setBt({ ...bt, first: x })} placeholder="AAAA-MM-DD" />
        </View>
        {bt.mode === "parcelado" && parseNum(bt.total) ? <Muted>{bt.n}x de {brl((parseNum(bt.total) || 0) / (Number(bt.n) || 1))} — cada mês recebe apenas a sua parcela.</Muted> : null}
        <Btn testID="batch-submit-button" title="Gerar lançamentos" onPress={submitBatch} />
      </Sheet>
      <Sheet visible={sheet === "recon"} onClose={() => setSheet(null)} title="Conciliação manual do caixa">
        <Muted>Saldo no sistema: {brl(o?.balance)}</Muted>
        <Field testID="recon-counted-input" label="Saldo real contado (banco + dinheiro)" value={rc.counted} onChangeText={(x) => setRc({ ...rc, counted: x })} numeric suffix="R$" />
        <Field testID="recon-note-input" label="Observação" value={rc.note} onChangeText={(x) => setRc({ ...rc, note: x })} />
        <Btn testID="recon-submit-button" title="Conciliar" onPress={submitRecon} />
      </Sheet>
    </Screen>
  );
}

const Notice2 = ({ text }: { text: string }) => (
  <View style={{ backgroundColor: colors.warningSoft, padding: 12, borderRadius: 12 }}><Text style={{ color: colors.warningText, fontSize: 13 }}>{text}</Text></View>
);
