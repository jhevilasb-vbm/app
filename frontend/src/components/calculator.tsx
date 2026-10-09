import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api, useApi, useList, invalidateAll } from "@/src/api";
import { Badge, Btn, Card, Chips, Divider, Field, Muted, Notice, Row, Section } from "@/src/components/ui";
import { SelectField } from "@/src/components/select";
import { useFeedback } from "@/src/components/feedback";
import { brl, fnum, parseNum, toStr } from "@/src/format";
import { colors, radius, spacing } from "@/src/theme";

const NUM_KEYS = ["qty", "weight_g", "filament_cost_kg", "power_w", "kwh_cost", "maintenance_pct", "failure_pct", "labor_minutes", "labor_hour",
  "extras_unit", "packaging_unit", "marketplace_pct", "payment_pct", "fixed_fee_order", "shipping_paid_order", "margin_pct", "markup_pct", "unit_price"];

export type CalcItem = {
  product_id?: string | null; name: string; qty: number; unit_price: number; unit_cost: number; fees_total: number;
  printer_id?: string; color?: string; customization?: string; calc: any; description?: string;
};

export function Calculator({ initial, onApply, applyLabel = "Adicionar ao orçamento" }: { initial?: Record<string, any>; onApply?: (i: CalcItem) => void; applyLabel?: string }) {
  const { toast } = useFeedback();
  const { data: settings = {} } = useApi<any>("/settings");
  const { data: printers = [] } = useList("printers");
  const { data: products = [] } = useList("products");
  const [v, setV] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = { qty: "1", print_h: "", print_m: "", name: "", pricing_mode: "", waste_mode: "" };
    Object.entries(initial || {}).forEach(([k, val]) => (o[k] = typeof val === "number" ? toStr(val) : String(val ?? "")));
    if (initial?.print_minutes) {
      o.print_h = String(Math.floor(initial.print_minutes / 60));
      o.print_m = String(Math.round(initial.print_minutes % 60));
    }
    return o;
  });
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<any>(null);
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));

  const body = useMemo(() => {
    const b: Record<string, any> = {};
    NUM_KEYS.forEach((k) => {
      const n = parseNum(v[k]);
      if (n !== null) b[k] = n;
    });
    const mins = (parseNum(v.print_h) || 0) * 60 + (parseNum(v.print_m) || 0);
    if (mins) b.print_minutes = mins;
    ["printer_id", "pricing_mode", "waste_mode", "product_id", "printer_compat"].forEach((k) => v[k] && (b[k] = v[k]));
    return b;
  }, [v]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setBusy(true);
      api.post("/calc", body).then(setRes).catch((e) => toast(e.message, "error")).finally(() => setBusy(false));
    }, 350);
    return () => clearTimeout(timer.current);
  }, [body, toast]);

  const pickProduct = async (id: string | null) => {
    if (!id) return set("product_id", "");
    const d = await api.get(`/products/${id}/calc-inputs`);
    setV((p) => ({
      ...p, product_id: id, name: d.name, weight_g: toStr(d.weight_g), labor_minutes: toStr(d.labor_minutes),
      print_h: String(Math.floor((d.print_minutes || 0) / 60)), print_m: String(Math.round((d.print_minutes || 0) % 60)),
      extras_unit: toStr(d.extras_unit), packaging_unit: toStr(d.packaging_unit), printer_compat: d.printer_compat || "",
      filament_cost_kg: d.filament_cost_kg ? toStr(d.filament_cost_kg) : p.filament_cost_kg, margin_pct: d.margin_pct != null ? toStr(d.margin_pct) : p.margin_pct,
    }));
  };

  const saveDefaults = async () => {
    const map: Record<string, string> = { filament_cost_kg: "filament_cost_kg", kwh_cost: "kwh_cost", labor_hour: "labor_hour", failure_pct: "failure_pct",
      marketplace_pct: "marketplace_pct", payment_pct: "payment_pct", fixed_fee_order: "fixed_fee", margin_pct: "margin_pct", markup_pct: "markup_pct", maintenance_pct: "maintenance_pct" };
    const upd: Record<string, any> = { ...settings };
    Object.entries(map).forEach(([k, sk]) => body[k] !== undefined && (upd[sk] = body[k]));
    if (v.pricing_mode) upd.pricing_mode = v.pricing_mode;
    if (v.waste_mode) upd.waste_mode = v.waste_mode;
    await api.put("/settings", upd);
    invalidateAll();
    toast("Premissas salvas como padrão");
  };

  const ph = (k: string, unit = "") => (settings[k] != null ? `Padrão: ${toStr(settings[k])}${unit}` : "Não cadastrado");
  const printer = printers.find((p: any) => p.id === (v.printer_id || res?.printer_id));
  const mode = v.pricing_mode || settings.pricing_mode || "margem";
  const waste = v.waste_mode || settings.waste_mode || "material";
  const b = res?.breakdown || {};

  const apply = () => {
    if (!res) return;
    if (!v.name && !v.product_id) return toast("Informe o nome do produto ou projeto", "error");
    const cust = [v.custom_text && `Texto: ${v.custom_text}`, v.color && `Cor: ${v.color}`, v.dimensions && `Dimensões: ${v.dimensions}`, v.custom_notes].filter(Boolean).join(" · ");
    onApply?.({
      product_id: v.product_id || null, name: v.name, qty: res.qty, unit_price: res.unit_price, unit_cost: res.unit_cost,
      fees_total: Math.round((res.fees_unit + res.shipping_unit) * res.qty * 100) / 100, printer_id: res.printer_id, color: v.color,
      customization: cust, calc: res,
    });
  };

  return (
    <View style={{ gap: spacing.lg }} testID="calculator">
      <Card>
        <Section title="Produto ou projeto">
          <SelectField testID="calc-product-select" label="Produto do catálogo (opcional)" value={v.product_id} onChange={pickProduct}
            options={products.map((p: any) => ({ value: p.id, label: p.name, sub: p.sku }))} />
          <Field testID="calc-name-input" label="Nome / descrição" value={v.name} onChangeText={(x) => set("name", x)} placeholder="Ex.: Chaveiro personalizado" />
          <View style={s.two}>
            <Field flex testID="calc-qty-input" label="Quantidade" value={v.qty} onChangeText={(x) => set("qty", x)} numeric suffix="un" />
            <Field flex testID="calc-weight-input" label="Filamento / un." value={v.weight_g || ""} onChangeText={(x) => set("weight_g", x)} numeric suffix="g" />
          </View>
          <View style={s.two}>
            <Field flex testID="calc-hours-input" label="Impressão / un." value={v.print_h} onChangeText={(x) => set("print_h", x)} numeric suffix="h" />
            <Field flex testID="calc-minutes-input" label=" " value={v.print_m} onChangeText={(x) => set("print_m", x)} numeric suffix="min" />
          </View>
          <Field testID="calc-filament-cost-input" label="Custo do filamento" value={v.filament_cost_kg || ""} onChangeText={(x) => set("filament_cost_kg", x)} numeric suffix="R$/kg" placeholder={ph("filament_cost_kg")} />
          <Text style={s.label}>Impressora</Text>
          <Chips testID="calc-printer" value={v.printer_id || res?.printer_id || ""} onChange={(x) => set("printer_id", x)} options={printers.map((p: any) => ({ value: p.id, label: p.name }))} />
        </Section>
      </Card>

      <Card>
        <Section title="Máquina, energia e perdas">
          <View style={s.two}>
            <Field flex testID="calc-power-input" label="Consumo" value={v.power_w || ""} onChangeText={(x) => set("power_w", x)} numeric suffix="W" placeholder={printer?.power_w != null ? `Impressora: ${printer.power_w}` : "Não cadastrado"} />
            <Field flex testID="calc-kwh-input" label="Custo kWh" value={v.kwh_cost || ""} onChangeText={(x) => set("kwh_cost", x)} numeric suffix="R$" placeholder={ph("kwh_cost")} />
          </View>
          <View style={s.two}>
            <Field flex testID="calc-maintenance-input" label="Manutenção" value={v.maintenance_pct || ""} onChangeText={(x) => set("maintenance_pct", x)} numeric suffix="%" placeholder={printer?.maintenance_pct != null ? `Impr.: ${printer.maintenance_pct}` : ph("maintenance_pct")} />
            <Field flex testID="calc-failure-input" label="Falhas" value={v.failure_pct || ""} onChangeText={(x) => set("failure_pct", x)} numeric suffix="%" placeholder={ph("failure_pct")} />
          </View>
          <Text style={s.label}>Desperdício calculado sobre</Text>
          <Chips testID="calc-waste-mode" value={waste} onChange={(x) => set("waste_mode", x)} options={[{ value: "material", label: "Somente filamento" }, { value: "custo", label: "Custo total direto" }]} />
          <Muted>Depreciação = valor da impressora ÷ vida útil (h). Configure em Configurações › Impressoras.</Muted>
        </Section>
      </Card>

      <Card>
        <Section title="Mão de obra, materiais e embalagem">
          <View style={s.two}>
            <Field flex testID="calc-labor-min-input" label="Mão de obra / un." value={v.labor_minutes || ""} onChangeText={(x) => set("labor_minutes", x)} numeric suffix="min" placeholder="Preparo, montagem..." />
            <Field flex testID="calc-labor-hour-input" label="Valor hora" value={v.labor_hour || ""} onChangeText={(x) => set("labor_hour", x)} numeric suffix="R$/h" placeholder={ph("labor_hour")} />
          </View>
          <View style={s.two}>
            <Field flex testID="calc-extras-input" label="Materiais extras / un." value={v.extras_unit || ""} onChangeText={(x) => set("extras_unit", x)} numeric suffix="R$" />
            <Field flex testID="calc-packaging-input" label="Embalagem e etiqueta" value={v.packaging_unit || ""} onChangeText={(x) => set("packaging_unit", x)} numeric suffix="R$" />
          </View>
        </Section>
      </Card>

      <Card>
        <Section title="Venda, taxas e lucro">
          <View style={s.two}>
            <Field flex testID="calc-marketplace-input" label="Taxa marketplace" value={v.marketplace_pct || ""} onChangeText={(x) => set("marketplace_pct", x)} numeric suffix="%" placeholder={ph("marketplace_pct")} />
            <Field flex testID="calc-payment-input" label="Taxa pagamento" value={v.payment_pct || ""} onChangeText={(x) => set("payment_pct", x)} numeric suffix="%" placeholder={ph("payment_pct")} />
          </View>
          <View style={s.two}>
            <Field flex testID="calc-fixed-fee-input" label="Taxa fixa / pedido" value={v.fixed_fee_order || ""} onChangeText={(x) => set("fixed_fee_order", x)} numeric suffix="R$" placeholder={ph("fixed_fee")} />
            <Field flex testID="calc-shipping-input" label="Frete pago / pedido" value={v.shipping_paid_order || ""} onChangeText={(x) => set("shipping_paid_order", x)} numeric suffix="R$" />
          </View>
          <Text style={s.label}>Forma de precificação</Text>
          <Chips testID="calc-pricing-mode" value={mode} onChange={(x) => set("pricing_mode", x)} options={[{ value: "margem", label: "Margem sobre o preço" }, { value: "markup", label: "Markup sobre o custo" }]} />
          {mode === "margem" ? (
            <Field testID="calc-margin-input" label="Margem de lucro desejada" value={v.margin_pct || ""} onChangeText={(x) => set("margin_pct", x)} numeric suffix="%" placeholder={ph("margin_pct")}
              hint="Margem = lucro ÷ preço de venda. Preço = (custo + taxas fixas) ÷ (1 − taxas% − margem%)" />
          ) : (
            <Field testID="calc-markup-input" label="Markup desejado" value={v.markup_pct || ""} onChangeText={(x) => set("markup_pct", x)} numeric suffix="%" placeholder={ph("markup_pct")}
              hint="Markup = lucro ÷ custo. O preço já considera as taxas sobre a venda." />
          )}
          <Field testID="calc-unit-price-input" label="Simular preço de venda (vazio = recomendado)" value={v.unit_price || ""} onChangeText={(x) => set("unit_price", x)} numeric suffix="R$/un" />
          <Btn testID="calc-save-defaults-button" small variant="ghost" icon="content-save-cog-outline" title="Salvar premissas como padrão" onPress={saveDefaults} />
        </Section>
      </Card>

      {res && (
        <Card style={{ backgroundColor: colors.surfaceTertiary }} testID="calc-results">
          <Section title="Resultado" right={busy ? <Badge label="Calculando..." tone="brand" /> : null}>
            {res.warnings?.length ? <Notice testID="calc-warnings" text={`Estimativa: valores não cadastrados (considerados 0): ${res.warnings.join(", ")}.`} /> : null}
            {res.errors?.map((e: string) => <Notice key={e} tone="error" text={e} />)}
            <Row label="1. Filamento" value={brl(b.filament)} testID="calc-r-filament" />
            <Row label="2. Energia" value={brl(b.energy)} testID="calc-r-energy" />
            <Row label="3. Manutenção e depreciação" value={brl(b.machine)} testID="calc-r-machine" />
            <Row label="4. Mão de obra" value={brl(b.labor)} />
            <Row label="5. Materiais complementares" value={brl(b.extras)} />
            <Row label="6. Embalagem" value={brl(b.packaging)} />
            <Row label="7. Falhas e desperdício" value={brl(b.waste)} />
            <Row label="8. Rateio de custos fixos" value={brl(b.fixed)} />
            <Divider />
            <Row label="9. Custo total de produção / un." value={brl(res.unit_cost)} bold testID="calc-r-unit-cost" />
            <Row label={`10. Taxas de venda / un. (${fnum(res.fees_pct, 1)}% + fixas)`} value={brl(res.fees_unit)} />
            {res.shipping_unit ? <Row label="Frete pago / un." value={brl(res.shipping_unit)} /> : null}
            <Row label="11. Preço de equilíbrio (sem lucro)" value={res.breakeven_price ? brl(res.breakeven_price) : "—"} testID="calc-r-breakeven" />
            <Row label="12. Preço mínimo p/ lucro desejado" value={res.min_price ? brl(res.min_price) : "—"} testID="calc-r-min-price" />
            <Row label="13. Preço recomendado" value={res.recommended_price ? brl(res.recommended_price) : "—"} bold color={colors.brand} testID="calc-r-recommended" />
            <Divider />
            <Row label="Preço considerado / un." value={brl(res.unit_price)} bold />
            <Row label="14. Lucro por unidade" value={brl(res.profit_unit)} color={res.profit_unit >= 0 ? colors.successText : colors.errorText} testID="calc-r-profit-unit" />
            <Row label="14. Lucro do pedido" value={brl(res.profit_order)} color={res.profit_order >= 0 ? colors.successText : colors.errorText} />
            <Row label="15. Margem real" value={`${fnum(res.margin_real_pct, 1)}%`} testID="calc-r-margin" hint={`Markup real: ${fnum(res.markup_real_pct, 1)}%`} />
            <Row label="16. Valor total do pedido" value={brl(res.order_total)} bold testID="calc-r-order-total" />
            <Row label="17. Tempo do lote" value={`${fnum(res.print_hours_total, 1)} h impressão`} hint={`+ ${fnum(res.labor_hours_total, 1)} h de mão de obra`} />
            {res.unit_price && v.unit_price ? null : (
              <View style={s.two}>
                {res.min_price ? <Btn small variant="secondary" title="Usar mínimo" onPress={() => set("unit_price", toStr(res.min_price))} /> : null}
              </View>
            )}
          </Section>
          <Divider />
          <Section title="18. Comparação A1 x A1 Mini">
            {res.comparison?.map((c: any) => (
              <View key={c.printer_id} style={s.cmp} testID={`calc-compare-${c.printer_id}`}>
                <Text style={s.cmpName}>{c.printer_name}</Text>
                <Text style={s.cmpV}>Custo {brl(c.unit_cost)} · Lucro {brl(c.profit_unit)}/un · {fnum(c.margin_real_pct, 1)}%</Text>
                <Muted>Lucro por hora de impressão: {c.profit_per_print_hour != null ? brl(c.profit_per_print_hour) : "—"}</Muted>
              </View>
            ))}
          </Section>
          <Divider />
          <Section title="Personalização (opcional)">
            <Field testID="calc-custom-text-input" label="Nome / texto" value={v.custom_text || ""} onChangeText={(x) => set("custom_text", x)} />
            <View style={s.two}>
              <Field flex testID="calc-color-input" label="Cor" value={v.color || ""} onChangeText={(x) => set("color", x)} />
              <Field flex testID="calc-dimensions-input" label="Dimensões" value={v.dimensions || ""} onChangeText={(x) => set("dimensions", x)} />
            </View>
            <Field testID="calc-custom-notes-input" label="Observações" value={v.custom_notes || ""} onChangeText={(x) => set("custom_notes", x)} multiline />
          </Section>
          {onApply ? <Btn testID="calc-apply-button" title={applyLabel} icon="plus-circle-outline" onPress={apply} disabled={!!res.errors?.length} /> : null}
        </Card>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  two: { flexDirection: "row", gap: spacing.md },
  label: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  cmp: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  cmpName: { color: colors.brand, fontWeight: "800", fontSize: 14 },
  cmpV: { color: colors.onSurface, fontSize: 13 },
});
