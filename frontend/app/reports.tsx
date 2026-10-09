import React, { useState } from "react";
import { Text, View } from "react-native";
import { useApi, useList } from "@/src/api";
import { Btn, Card, Chips, ErrorView, Field, Grid, KPI, Loading, Muted, Row, Screen, Section } from "@/src/components/ui";
import { SelectField } from "@/src/components/select";
import { useFeedback } from "@/src/components/feedback";
import { exportCSV, exportPDF, tableHTML } from "@/src/export";
import { CHANNELS, O, PERIODS, brl, fdate, fnum, periodRange } from "@/src/format";
import { colors } from "@/src/theme";

function Table({ rows, max = 8 }: { rows: Record<string, any>[]; max?: number }) {
  if (!rows.length) return <Muted>Sem dados no período.</Muted>;
  const cols = Object.keys(rows[0]).slice(0, 4);
  return (
    <View style={{ gap: 4 }}>
      {rows.slice(0, max).map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
          {cols.map((c) => <Text key={c} style={{ flex: 1, color: colors.onSurfaceTertiary, fontSize: 12 }} numberOfLines={1}>{typeof r[c] === "number" ? fnum(r[c], 2) : String(r[c] ?? "—")}</Text>)}
        </View>
      ))}
      {rows.length > max ? <Muted>+ {rows.length - max} linha(s) na exportação</Muted> : null}
    </View>
  );
}

export default function Reports() {
  const { toast } = useFeedback();
  const [period, setPeriod] = useState("month");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const [flt, setFlt] = useState<Record<string, string | null>>({ product_id: null, client_id: null, channel: null, printer_id: null });
  const pr = periodRange(period);
  const start = period === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(custom.start) ? custom.start : pr.start;
  const end = period === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(custom.end) ? custom.end : pr.end;
  const qs = Object.entries(flt).filter(([, v]) => v).map(([k, v]) => `&${k}=${v}`).join("");
  const { data: d, isLoading, isError, refetch } = useApi<any>(`/reports?start=${start}&end=${end}${qs}`);
  const { data: products = [] } = useList("products");
  const { data: clients = [] } = useList("clients");
  const { data: printers = [] } = useList("printers");

  const csv = (name: string, rows: any[]) => exportCSV(`vbm-${name}-${start}_${end}`, rows).then(() => toast("Exportado")).catch((e) => toast(e.message, "error"));
  const sections = d ? [
    { key: "vendas", title: "Vendas / faturamento", rows: d.sales },
    { key: "lucro-produto", title: "Lucro por produto", rows: d.products.map((p: any) => ({ produto: p.name, qtd: p.qty, receita: p.revenue, lucro: p.profit })) },
    { key: "despesas", title: "Despesas por categoria", rows: d.expenses_by_category.map((x: any) => ({ categoria: x.name, valor: x.value })) },
    { key: "canais", title: "Faturamento por canal", rows: d.revenue_by_channel.map((x: any) => ({ canal: CHANNELS[x.name] || x.name, valor: x.value })) },
    { key: "contas", title: "Contas do período", rows: d.bills },
    { key: "impressoras", title: "Desempenho das impressoras", rows: d.printers },
    { key: "filamento", title: "Consumo de filamento", rows: d.filament },
    { key: "estoque", title: "Estoque atual", rows: d.stock },
    { key: "compras", title: "Compras futuras", rows: d.purchases },
  ] : [];

  return (
    <Screen title="Relatórios" subtitle={`${fdate(start)} a ${fdate(end)}`} testID="reports-screen"
      sub={<Chips testID="reports-period" options={[...PERIODS, { value: "custom", label: "Personalizado" }]} value={period} onChange={setPeriod} />}>
      {period === "custom" ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Field flex testID="reports-start-input" label="Início" value={custom.start} onChangeText={(x) => setCustom({ ...custom, start: x })} placeholder="AAAA-MM-DD" />
          <Field flex testID="reports-end-input" label="Fim" value={custom.end} onChangeText={(x) => setCustom({ ...custom, end: x })} placeholder="AAAA-MM-DD" />
        </View>
      ) : null}
      <Card>
        <Section title="Filtros">
          <SelectField testID="reports-product-filter" label="Produto" value={flt.product_id} onChange={(v) => setFlt({ ...flt, product_id: v })} options={products.map((p: any) => ({ value: p.id, label: p.name }))} placeholder="Todos" />
          <SelectField testID="reports-client-filter" label="Cliente" value={flt.client_id} onChange={(v) => setFlt({ ...flt, client_id: v })} options={clients.map((p: any) => ({ value: p.id, label: p.name }))} placeholder="Todos" />
          <SelectField testID="reports-channel-filter" label="Canal" value={flt.channel} onChange={(v) => setFlt({ ...flt, channel: v })} options={O.channel} placeholder="Todos" />
          <SelectField testID="reports-printer-filter" label="Impressora" value={flt.printer_id} onChange={(v) => setFlt({ ...flt, printer_id: v })} options={printers.map((p: any) => ({ value: p.id, label: p.name }))} placeholder="Todas" />
        </Section>
      </Card>
      {isLoading ? <Loading /> : isError || !d ? <ErrorView onRetry={refetch} /> : (
        <>
          <Grid>
            <KPI testID="rep-revenue" label="Faturamento" value={brl(d.summary.revenue)} />
            <KPI testID="rep-received" label="Recebimentos" value={brl(d.summary.received)} />
            <KPI testID="rep-costs" label="Custos + despesas" value={brl(d.summary.cogs + d.summary.fees + d.summary.opex)} />
            <KPI testID="rep-net" label="Lucro líquido est." value={brl(d.summary.net_profit)} color={d.summary.net_profit >= 0 ? colors.successText : colors.errorText} />
            <KPI testID="rep-conversion" label="Conversão de orçamentos" value={`${fnum(d.quotes.conversion_pct, 1)}%`} sub={`${d.quotes.approved} aprovados · ${d.quotes.refused} recusados de ${d.quotes.total}`} />
            <KPI testID="rep-losses" label="Perdas e retrabalho" value={`${fnum(d.losses.defeitos)} defeitos`} sub={`${d.losses.falhas} falhas · ${fnum(d.losses.refeitas)} refeitas · ${fnum(d.losses.desperdicio_g)} g`} />
          </Grid>
          <Card>
            <Section title="Contas do período">
              <Row label="Pagas" value={brl(d.bills_status.pago)} color={colors.successText} />
              <Row label="Pendentes" value={brl(d.bills_status.pendente)} color={colors.warningText} />
              <Row label="Atrasadas" value={brl(d.bills_status.vencido)} color={colors.errorText} />
            </Section>
          </Card>
          <Btn testID="reports-pdf-button" icon="file-pdf-box" title="Gerar relatório completo em PDF"
            onPress={() => exportPDF(tableHTML(`Relatório ${fdate(start)} a ${fdate(end)}`, sections)).catch((e) => toast(e.message, "error"))} />
          {sections.map((s) => (
            <Card key={s.key} testID={`report-section-${s.key}`}>
              <Section title={s.title} right={<Btn testID={`report-csv-${s.key}`} small variant="ghost" icon="file-delimited-outline" title="CSV" onPress={() => csv(s.key, s.rows)} />}>
                <Table rows={s.rows} />
              </Section>
            </Card>
          ))}
          <Muted>CSV abre no Excel/Google Planilhas (separador ponto e vírgula).</Muted>
        </>
      )}
    </Screen>
  );
}
