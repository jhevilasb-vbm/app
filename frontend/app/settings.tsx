import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api, invalidateAll, useApi, useList } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Btn, Card, Chips, Field, Loading, Muted, Notice, Screen, Section, st } from "@/src/components/ui";
import { Sheet, useFeedback } from "@/src/components/feedback";
import { brl, parseNum, toStr } from "@/src/format";

const F: { key: string; label: string; suffix?: string; hint?: string }[] = [
  { key: "filament_cost_kg", label: "Preço padrão do filamento", suffix: "R$/kg", hint: "Usado quando o filamento do estoque não tem custo" },
  { key: "kwh_cost", label: "Custo do kWh (tarifa de energia)", suffix: "R$" },
  { key: "labor_hour", label: "Valor da hora de trabalho", suffix: "R$/h" },
  { key: "maintenance_pct", label: "Manutenção padrão (sobre depreciação)", suffix: "%" },
  { key: "failure_pct", label: "Falhas e desperdício", suffix: "%" },
  { key: "marketplace_pct", label: "Taxa padrão de marketplace", suffix: "%" },
  { key: "payment_pct", label: "Taxa de meio de pagamento", suffix: "%" },
  { key: "fixed_fee", label: "Taxa fixa por pedido", suffix: "R$" },
  { key: "fixed_costs_monthly", label: "Custos fixos mensais (rateio)", suffix: "R$", hint: "Internet, software, aluguel..." },
  { key: "productive_hours_month", label: "Horas de impressão por mês", suffix: "h", hint: "Base do rateio: custo fixo ÷ horas" },
  { key: "margin_pct", label: "Margem desejada padrão", suffix: "%" },
  { key: "markup_pct", label: "Markup padrão", suffix: "%" },
  { key: "initial_balance", label: "Saldo inicial do caixa", suffix: "R$" },
  { key: "quote_validity_days", label: "Validade padrão dos orçamentos", suffix: "dias" },
];
const T = ["company_name", "company_phone", "company_instagram", "payment_terms_default"];

export default function Settings() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { toast, confirm } = useFeedback();
  const { data: s, isLoading } = useApi<any>("/settings");
  const { data: printers = [] } = useList("printers");
  const { data: cats = [] } = useList("categories");
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pwd, setPwd] = useState<null | { cur: string; nw: string; name: string }>(null);

  useEffect(() => {
    if (!s) return;
    const o: Record<string, string> = { pricing_mode: s.pricing_mode || "margem", waste_mode: s.waste_mode || "material" };
    F.forEach((f) => (o[f.key] = toStr(s[f.key])));
    T.forEach((k) => (o[k] = s[k] || ""));
    setV(o);
  }, [s]);
  const set = (k: string, x: string) => setV((p) => ({ ...p, [k]: x }));
  const missing = F.filter((f) => !["markup_pct", "fixed_fee", "initial_balance"].includes(f.key) && (v[f.key] ?? "") === "").length;

  const save = async () => {
    setBusy(true);
    const body: Record<string, any> = { ...s, pricing_mode: v.pricing_mode, waste_mode: v.waste_mode };
    F.forEach((f) => (body[f.key] = parseNum(v[f.key])));
    T.forEach((k) => (body[k] = v[k]));
    try {
      await api.put("/settings", body);
      invalidateAll();
      toast("Premissas salvas. Orçamentos já aprovados mantêm os valores originais.");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const demo = async (create: boolean) => {
    if (!create && !(await confirm({ title: "Remover dados de demonstração?", message: "Apaga todos os registros marcados como [DEMO].", danger: true, confirmText: "Remover" }))) return;
    try {
      const r = create ? await api.post("/demo/seed") : await api.del("/demo");
      invalidateAll();
      toast(create ? "Dados de demonstração criados" : `${r.removed} registro(s) removido(s)`);
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const changePwd = async () => {
    try {
      await api.post("/auth/change-password", { current_password: pwd!.cur, new_password: pwd!.nw, name: pwd!.name || null });
      setPwd(null);
      toast("Dados de acesso atualizados");
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  if (isLoading || !s) return <Screen title="Configurações"><Loading /></Screen>;
  return (
    <Screen title="Configurações" subtitle="Premissas, impressoras e conta" keyboard testID="settings-screen"
      footer={<Btn testID="settings-save-button" title="Salvar premissas" icon="content-save" onPress={save} loading={busy} />}>
      {missing ? <Notice testID="settings-missing-notice" text={`${missing} premissa(s) sem valor. Os cálculos tratarão como estimativa até você preencher com os valores reais.`} /> : null}
      <Card>
        <Section title="Empresa">
          <Field testID="settings-company_name-input" label="Nome" value={v.company_name || ""} onChangeText={(x) => set("company_name", x)} />
          <Field testID="settings-company_phone-input" label="Telefone / WhatsApp" value={v.company_phone || ""} onChangeText={(x) => set("company_phone", x)} />
          <Field testID="settings-company_instagram-input" label="Instagram" value={v.company_instagram || ""} onChangeText={(x) => set("company_instagram", x)} />
          <Field testID="settings-payment_terms_default-input" label="Condições de pagamento padrão" value={v.payment_terms_default || ""} onChangeText={(x) => set("payment_terms_default", x)} />
        </Section>
      </Card>
      <Card>
        <Section title="Premissas de custo e preço">
          {F.map((f) => (
            <Field key={f.key} testID={`settings-${f.key}-input`} label={f.label} value={v[f.key] || ""} onChangeText={(x) => set(f.key, x)} numeric suffix={f.suffix} hint={f.hint} placeholder="Não cadastrado" />
          ))}
          <Text style={st.label}>Precificação padrão</Text>
          <Chips testID="settings-pricing-mode" value={v.pricing_mode} onChange={(x) => set("pricing_mode", x)} options={[{ value: "margem", label: "Margem" }, { value: "markup", label: "Markup" }]} />
          <Text style={st.label}>Desperdício calculado sobre</Text>
          <Chips testID="settings-waste-mode" value={v.waste_mode} onChange={(x) => set("waste_mode", x)} options={[{ value: "material", label: "Filamento" }, { value: "custo", label: "Custo total direto" }]} />
        </Section>
      </Card>
      <Section title="Impressoras">
        {printers.map((p: any) => (
          <Card key={p.id} testID={`settings-printer-${p.id}`} onPress={() => router.push({ pathname: "/form", params: { col: "printers", id: p.id } })}>
            <View style={st.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.h}>{p.name}</Text>
                <Muted>{p.power_w ? `${p.power_w} W` : "Consumo não cadastrado"} · {p.purchase_price ? brl(p.purchase_price) : "valor não cadastrado"} · {p.lifespan_hours ? `${p.lifespan_hours} h vida útil` : "vida útil não cadastrada"}</Muted>
              </View>
              {!p.power_w || !p.purchase_price || !p.lifespan_hours ? <Badge label="Completar" tone="warning" /> : <Badge label="OK" tone="success" />}
            </View>
          </Card>
        ))}
      </Section>
      <Section title="Categorias financeiras" right={<Btn testID="settings-new-category-button" small variant="ghost" icon="plus" title="Nova" onPress={() => router.push({ pathname: "/form", params: { col: "categories" } })} />}>
        <Card>
          {cats.map((c: any) => (
            <View key={c.id} style={[st.listRow, { minHeight: 40 }]}>
              <Text style={[st.h, { flex: 1, fontWeight: "500" }]} onPress={() => router.push({ pathname: "/form", params: { col: "categories", id: c.id } })}>{c.name}</Text>
              <Badge label={c.in_result ? "No resultado" : "Já no custo"} tone={c.in_result ? "brand" : "info"} />
            </View>
          ))}
        </Card>
      </Section>
      <Card>
        <Section title="Conta">
          <Muted>{user?.name} · {user?.email}</Muted>
          <Btn testID="settings-change-password-button" variant="secondary" icon="lock-reset" title="Alterar nome / senha" onPress={() => setPwd({ cur: "", nw: "", name: user?.name || "" })} />
          <Btn testID="settings-audit-button" variant="secondary" icon="history" title="Histórico de alterações" onPress={() => router.push("/audit")} />
          <Btn testID="settings-logout-button" variant="ghost" icon="logout" title="Sair" onPress={logout} />
        </Section>
      </Card>
      <Card>
        <Section title="Dados de demonstração">
          <Muted>Cria registros fictícios marcados com [DEMO] para testar o sistema. Podem ser removidos a qualquer momento sem afetar seus dados reais.</Muted>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Btn testID="settings-demo-seed-button" small variant="secondary" title="Criar demo" onPress={() => demo(true)} /></View>
            <View style={{ flex: 1 }}><Btn testID="settings-demo-clear-button" small variant="secondary" title="Remover demo" onPress={() => demo(false)} /></View>
          </View>
        </Section>
      </Card>
      <Sheet visible={!!pwd} onClose={() => setPwd(null)} title="Alterar nome / senha">
        <Field testID="pwd-name-input" label="Nome exibido" value={pwd?.name || ""} onChangeText={(x) => setPwd({ ...pwd!, name: x })} />
        <Field testID="pwd-current-input" label="Senha atual" value={pwd?.cur || ""} onChangeText={(x) => setPwd({ ...pwd!, cur: x })} secure />
        <Field testID="pwd-new-input" label="Nova senha (mín. 6)" value={pwd?.nw || ""} onChangeText={(x) => setPwd({ ...pwd!, nw: x })} secure />
        <Btn testID="pwd-submit-button" title="Salvar" onPress={changePwd} />
      </Sheet>
    </Screen>
  );
}
