import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, invalidateAll, useList } from "@/src/api";
import { Btn, Card, Chips, Field, IconBtn, Loading, Muted, Row, Screen, Section, Toggle, st } from "@/src/components/ui";
import { SelectField } from "@/src/components/select";
import { useFeedback } from "@/src/components/feedback";
import { O, addDays, brl, parseNum, toStr, today } from "@/src/format";

type It = { product_id?: string | null; name: string; qty: string; unit_price: string; unit_cost: string; customization: string; color?: string };

export default function OrderEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { toast } = useFeedback();
  const { data: clients = [] } = useList("clients");
  const { data: products = [] } = useList("products");
  const [items, setItems] = useState<It[]>([]);
  const [h, setH] = useState<Record<string, any>>({ client_id: "", channel: "whatsapp", order_date: today(), due_date: addDays(today(), 7), discount: "", shipping_charged: "",
    shipping_paid: "", marketplace_fee: "", payment_fee: "", fees_deducted: true, payment_terms: "", notes: "" });
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setH((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!id) return;
    api.get(`/c/orders/${id}`).then((o) => {
      setItems(o.items.map((i: any) => ({ ...i, qty: toStr(i.qty), unit_price: toStr(i.unit_price), unit_cost: toStr(i.unit_cost), customization: i.customization || "" })));
      const nh: Record<string, any> = {};
      Object.keys(h).forEach((k) => (nh[k] = typeof o[k] === "number" ? toStr(o[k]) : o[k] ?? h[k]));
      nh.fees_deducted = o.fees_deducted !== false;
      setH(nh);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addProduct = async (pid: string | null) => {
    if (!pid) return;
    const p = products.find((x: any) => x.id === pid);
    try {
      const inp = await api.get(`/products/${pid}/calc-inputs`);
      const c = await api.post("/calc", { ...inp, qty: 1 });
      setItems((prev) => [...prev, { product_id: pid, name: p.name, qty: "1", unit_price: toStr(p.price || c.recommended_price || 0), unit_cost: toStr(c.unit_cost), customization: "", color: p.color }]);
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const upd = (idx: number, k: keyof It, v: string) => setItems((p) => p.map((i, n) => (n === idx ? { ...i, [k]: v } : i)));

  const sub = items.reduce((a, i) => a + (parseNum(i.qty) || 0) * (parseNum(i.unit_price) || 0), 0);
  const total = sub - (parseNum(h.discount) || 0) + (parseNum(h.shipping_charged) || 0);
  const fees = (parseNum(h.marketplace_fee) || 0) + (parseNum(h.payment_fee) || 0);
  const cost = items.reduce((a, i) => a + (parseNum(i.qty) || 0) * (parseNum(i.unit_cost) || 0), 0) + (parseNum(h.shipping_paid) || 0);

  const save = async () => {
    if (!items.length) return toast("Adicione ao menos um item", "error");
    if (items.some((i) => !i.name || !parseNum(i.qty))) return toast("Itens precisam de nome e quantidade", "error");
    setBusy(true);
    const body: Record<string, any> = { ...h, client_id: h.client_id || null };
    ["discount", "shipping_charged", "shipping_paid", "marketplace_fee", "payment_fee"].forEach((k) => (body[k] = parseNum(h[k]) || 0));
    body.items = items.map((i) => ({ ...i, qty: parseNum(i.qty), unit_price: parseNum(i.unit_price) || 0, unit_cost: parseNum(i.unit_cost) || 0 }));
    try {
      const o = id ? await api.put(`/c/orders/${id}`, body) : await api.post("/c/orders", body);
      invalidateAll();
      toast("Pedido salvo");
      router.replace(`/order/${o.id}`);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={id ? "Editar pedido" : "Novo pedido"} keyboard testID="order-edit-screen"
      footer={<Btn testID="order-save-button" title={`Salvar · ${brl(total)}`} icon="content-save" onPress={save} loading={busy} />}>
      {loading ? <Loading /> : (
        <>
          <Card>
            <SelectField testID="order-client-select" label="Cliente" value={h.client_id} onChange={(v) => set("client_id", v || "")} options={clients.map((c: any) => ({ value: c.id, label: c.name }))} />
            <Text style={st.label}>Canal de venda</Text>
            <Chips testID="order-channel" options={O.channel} value={h.channel} onChange={(v) => set("channel", v)} />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Field flex testID="order-date-input" label="Data do pedido" value={h.order_date} onChangeText={(v) => set("order_date", v)} placeholder="AAAA-MM-DD" />
              <Field flex testID="order-due-date-input" label="Prazo de entrega" value={h.due_date} onChangeText={(v) => set("due_date", v)} placeholder="AAAA-MM-DD" />
            </View>
          </Card>
          <Section title="Produtos">
            <SelectField testID="order-add-product-select" label="Adicionar produto do catálogo" value={null} onChange={addProduct} options={products.map((p: any) => ({ value: p.id, label: p.name, sub: brl(p.price) }))} />
            <Btn testID="order-add-custom-item-button" small variant="ghost" icon="plus" title="Item personalizado (sem catálogo)" onPress={() => setItems((p) => [...p, { name: "", qty: "1", unit_price: "", unit_cost: "", customization: "", product_id: null }])} />
            {items.map((i, idx) => (
              <Card key={idx} testID={`order-item-${idx}`}>
                <View style={st.listRow}>
                  <View style={{ flex: 1 }}>
                    {i.product_id ? <Text style={st.h}>{i.name}</Text> : <Field testID={`order-item-name-${idx}`} label="Descrição" value={i.name} onChangeText={(v) => upd(idx, "name", v)} />}
                  </View>
                  <IconBtn testID={`order-item-remove-${idx}`} icon="delete-outline" onPress={() => setItems(items.filter((_, n) => n !== idx))} />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Field flex testID={`order-item-qty-${idx}`} label="Qtd." value={i.qty} onChangeText={(v) => upd(idx, "qty", v)} numeric />
                  <Field flex testID={`order-item-price-${idx}`} label="Preço un." value={i.unit_price} onChangeText={(v) => upd(idx, "unit_price", v)} numeric />
                  <Field flex testID={`order-item-cost-${idx}`} label="Custo un." value={i.unit_cost} onChangeText={(v) => upd(idx, "unit_cost", v)} numeric />
                </View>
                <Field testID={`order-item-custom-${idx}`} label="Personalização (nome, texto, cor, medidas...)" value={i.customization} onChangeText={(v) => upd(idx, "customization", v)} />
              </Card>
            ))}
          </Section>
          <Card>
            <Section title="Valores e taxas">
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Field flex testID="order-discount-input" label="Desconto" value={h.discount} onChangeText={(v) => set("discount", v)} numeric suffix="R$" />
                <Field flex testID="order-shipping-charged-input" label="Frete cobrado" value={h.shipping_charged} onChangeText={(v) => set("shipping_charged", v)} numeric suffix="R$" />
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Field flex testID="order-marketplace-fee-input" label="Taxa marketplace" value={h.marketplace_fee} onChangeText={(v) => set("marketplace_fee", v)} numeric suffix="R$" />
                <Field flex testID="order-payment-fee-input" label="Taxa pagamento" value={h.payment_fee} onChangeText={(v) => set("payment_fee", v)} numeric suffix="R$" />
              </View>
              <Field testID="order-shipping-paid-input" label="Frete pago pela empresa" value={h.shipping_paid} onChangeText={(v) => set("shipping_paid", v)} numeric suffix="R$" />
              <Toggle testID="order-fees-deducted-toggle" label="Taxas descontadas no repasse" hint="Ligado: o marketplace já desconta (ex.: Shopee). Desligado: gera conta a pagar da taxa." value={!!h.fees_deducted} onChange={(v) => set("fees_deducted", v)} />
              <Field testID="order-payment-terms-input" label="Condições de pagamento" value={h.payment_terms} onChangeText={(v) => set("payment_terms", v)} />
              <Field testID="order-notes-input" label="Observações" value={h.notes} onChangeText={(v) => set("notes", v)} multiline />
            </Section>
          </Card>
          <Card>
            <Row label="Total do pedido" value={brl(total)} bold />
            <Row label="Taxas" value={brl(fees)} />
            <Row label="Custo estimado" value={brl(cost)} />
            <Row label="Lucro estimado" value={brl(total - fees - cost)} />
            <Muted>O valor só conta como recebido quando um pagamento for registrado.</Muted>
          </Card>
        </>
      )}
    </Screen>
  );
}
