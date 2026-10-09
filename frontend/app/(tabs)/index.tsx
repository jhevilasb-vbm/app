import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useApi } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Card, Chips, Empty, ErrorView, Grid, KPI, Loading, Muted, Notice, Row, Screen, Section, Btn, Divider } from "@/src/components/ui";
import { BarChart, HBars } from "@/src/components/bars";
import { PERIODS, brl, fdate, fnum, periodRange } from "@/src/format";
import { colors, radius, spacing } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1652120268427-9ba66e870467?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [period, setPeriod] = useState("month");
  const { start, end } = periodRange(period);
  const { data: d, isLoading, isError, refetch, isRefetching } = useApi<any>(`/dashboard?start=${start}&end=${end}`);
  const m = d?.metrics;
  const f = d?.finance;

  return (
    <Screen title="VBM GESTÃO 3D" subtitle={`Olá, ${user?.name}`} back={false} tab refreshing={isRefetching} onRefresh={refetch} testID="dashboard-screen"
      sub={<Chips testID="dashboard-period" options={PERIODS} value={period} onChange={setPeriod} />}>
      {isLoading ? <Loading /> : isError ? <ErrorView onRetry={refetch} /> : (
        <>
          <View style={s.hero} testID="dashboard-hero">
            <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={["rgba(18,18,18,0.2)", colors.scrim]} style={StyleSheet.absoluteFill} />
            <Text style={s.heroLabel}>Faturamento do período</Text>
            <Text style={s.heroValue} testID="dashboard-revenue">{brl(m.revenue)}</Text>
            <View style={s.heroRow}>
              <View><Text style={s.heroSmall}>Recebido (caixa)</Text><Text style={s.heroSmallV} testID="dashboard-received">{brl(m.received)}</Text></View>
              <View><Text style={s.heroSmall}>Lucro líquido est.</Text><Text style={[s.heroSmallV, { color: m.net_profit >= 0 ? colors.successText : colors.errorText }]} testID="dashboard-net-profit">{brl(m.net_profit)}</Text></View>
              <View><Text style={s.heroSmall}>Pedidos</Text><Text style={s.heroSmallV}>{m.orders_count}</Text></View>
            </View>
          </View>
          {d.metrics.orders_count === 0 && d.orders_open === 0 ? (
            <Notice tone="info" text="Ainda não há pedidos no período. Cadastre produtos, faça um orçamento ou crie dados de demonstração em Configurações." />
          ) : null}
          <Grid>
            <KPI testID="kpi-saldo" icon="bank-outline" label="Saldo de caixa" value={brl(f.balance)} sub="Entradas e saídas efetivas" onPress={() => router.push("/finance")} />
            <KPI testID="kpi-despesas" icon="arrow-down-bold-circle-outline" label="Despesas do período" value={brl(m.expenses_total)} sub="Por vencimento" color={colors.errorText} onPress={() => router.push("/finance")} />
            <KPI testID="kpi-lucro-bruto" icon="chart-line" label="Lucro bruto" value={brl(m.gross_profit)} sub="Receita − taxas − custo produtos" />
            <KPI testID="kpi-a-receber" icon="cash-clock" label="A receber" value={brl(f.receivables_total)} sub="Ainda não recebido" color={colors.warningText} onPress={() => router.push("/finance")} />
            <KPI testID="kpi-a-pagar" icon="calendar-alert" label="Contas a pagar" value={brl(f.payables_total)} sub={f.overdue_count ? `${f.overdue_count} vencida(s): ${brl(f.overdue_total)}` : "Nenhuma vencida"} color={f.overdue_count ? colors.errorText : undefined} onPress={() => router.push("/finance")} />
            <KPI testID="kpi-orcamentos" icon="file-clock-outline" label="Orçamentos aguardando" value={String(d.quotes_waiting)} sub={brl(d.quotes_waiting_value)} onPress={() => router.push("/quotes")} />
            <KPI testID="kpi-pedidos" icon="shopping-outline" label="Pedidos em aberto" value={String(d.orders_open)} sub={`${d.orders_late} atrasado(s) · ${d.orders_ready} pronto(s)`} color={d.orders_late ? colors.errorText : undefined} onPress={() => router.push("/orders")} />
            <KPI testID="kpi-producao" icon="printer-3d-nozzle" label="Produção" value={`${d.jobs_printing} imprimindo`} sub={`${d.jobs_queue} na fila · ${d.finished_ready_units} un. prontas`} onPress={() => router.push("/production")} />
            <KPI testID="kpi-estoque-baixo" icon="alert-decagram-outline" label="Estoque baixo" value={String(d.low_stock.length)} sub="Itens no mínimo" color={d.low_stock.length ? colors.warningText : undefined} onPress={() => router.push("/inventory")} />
            <KPI testID="kpi-compras" icon="cart-outline" label="Lista de compras" value={String(d.purchases_open)} sub={brl(d.purchases_value)} onPress={() => router.push("/purchases")} />
          </Grid>

          <Card>
            <Section title="Resultado x caixa (6 meses)">
              <BarChart testID="dashboard-chart" data={d.chart} labelKey="month" series={[
                { key: "revenue", label: "Faturamento", color: colors.brand },
                { key: "received", label: "Recebido", color: colors.success },
                { key: "expenses", label: "Despesas", color: colors.error },
              ]} />
              <Muted>Faturamento = vendas registradas. Recebido = dinheiro que entrou no caixa. Lucro líquido = faturamento − taxas − custo dos produtos − despesas operacionais.</Muted>
            </Section>
          </Card>

          <Card>
            <Section title="Demonstrativo do período">
              <Row label="Faturamento" value={brl(m.revenue)} />
              <Row label="(−) Taxas de venda" value={brl(m.fees)} />
              <Row label="(−) Custo dos produtos vendidos" value={brl(m.cogs)} />
              <Row label="= Lucro bruto" value={brl(m.gross_profit)} bold />
              <Row label="(−) Despesas operacionais" value={brl(m.opex)} />
              <Row label="= Lucro líquido estimado" value={brl(m.net_profit)} bold color={m.net_profit >= 0 ? colors.successText : colors.errorText} />
            </Section>
          </Card>

          {d.reminders.length ? (
            <Card>
              <Section title="Lembretes de clientes">
                {d.reminders.map((r: any) => (
                  <Row key={r.id} label={`${r.client}: ${r.note}`} value={fdate(r.date)} />
                ))}
              </Section>
            </Card>
          ) : null}

          <Card>
            <Section title="Próximas contas" right={<Btn small variant="ghost" title="Financeiro" onPress={() => router.push("/finance")} />}>
              {d.upcoming_bills.length === 0 ? <Muted>Nenhuma conta pendente.</Muted> : d.upcoming_bills.map((b: any) => (
                <View key={b.id} style={s.billRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.billName} numberOfLines={1}>{b.description}</Text>
                    <Muted>{fdate(b.due_date)} · {b.category || "Sem categoria"}</Muted>
                  </View>
                  <Text style={s.billVal}>{brl(b.amount)}</Text>
                  {b.status === "vencido" ? <Badge label="Vencida" tone="error" /> : null}
                </View>
              ))}
            </Section>
          </Card>

          <Card>
            <Section title="Impressoras">
              {d.printer_hours.map((p: any) => (
                <View key={p.name} style={s.billRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.billName}>{p.name}</Text>
                    <Muted>{p.queue} trabalho(s) na fila</Muted>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.billVal}>{fnum(p.period_hours, 1)} h no período</Text>
                    <Muted>{fnum(p.total_hours, 1)} h no total</Muted>
                  </View>
                </View>
              ))}
            </Section>
          </Card>

          <Card>
            <Section title="Mais vendidos (qtd.)">
              {m.top_products_qty.length === 0 ? <Muted>Sem vendas no período.</Muted> : m.top_products_qty.map((p: any) => (
                <Row key={p.name} label={p.name} value={`${fnum(p.qty)} un.`} />
              ))}
            </Section>
            <Divider />
            <Section title="Mais lucrativos">
              <HBars items={m.top_products_profit.map((p: any) => ({ name: p.name, value: p.profit }))} />
            </Section>
          </Card>

          {d.low_stock.length ? (
            <Card>
              <Section title="Materiais para comprar" right={<Btn small variant="ghost" title="Compras" onPress={() => router.push("/purchases")} />}>
                {d.low_stock.map((x: any) => <Row key={x.id} label={x.name} value={`${fnum(x.qty)} ${x.unit} (mín. ${fnum(x.min_qty)})`} color={colors.warningText} />)}
              </Section>
            </Card>
          ) : null}
          {!d ? <Empty title="Sem dados" /> : null}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: radius.lg, overflow: "hidden", padding: spacing.xl, gap: spacing.sm, minHeight: 180, justifyContent: "flex-end", borderWidth: 1, borderColor: colors.border },
  heroLabel: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  heroValue: { color: colors.onSurface, fontSize: 34, fontWeight: "900", letterSpacing: -1 },
  heroRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  heroSmall: { color: colors.muted, fontSize: 11 },
  heroSmallV: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  billRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 4 },
  billName: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  billVal: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
});
