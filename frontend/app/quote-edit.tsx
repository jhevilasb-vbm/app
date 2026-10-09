import React, { useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, invalidateAll, useApi, useList } from "@/src/api";
import { Btn, Card, Chips, Field, IconBtn, Loading, Muted, Row, Screen, Section, st } from "@/src/components/ui";
import { SelectField } from "@/src/components/select";
import { Calculator, CalcItem } from "@/src/components/calculator";
import { useFeedback } from "@/src/components/feedback";
import { takePendingItem } from "@/src/draft";
import { O, addDays, brl, parseNum, toStr, today } from "@/src/format";

export default function QuoteEdit() {
  const { id, client_id } = useLocalSearchParams<{ id?: string; client_id?: string }>();
  const router = useRouter();
  const { toast } = useFeedback();
  const { data: clients = [] } = useList("clients");
  const { data: settings } = useApi<any>("/settings");
  const [items, setItems] = useState<CalcItem[]>([]);
  const [h, setH] = useState<Record<string, string>>({ client_id: client_id || "", channel: "whatsapp", production_days: "7", discount: "", deposit: "", payment_terms: "", notes: "", valid_until: "" });
  const [calcOpen, setCalcOpen] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setH((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const p = takePendingItem();
    if (p) setItems([p]);
    if (id)
      api.get(`/c/quotes/${id}`).then((q) => {
        setItems(q.items || []);
        setH({ client_id: q.client_id || "", channel: q.channel || "whatsapp", production_days: toStr(q.production_days), discount: toStr(q.discount),
          deposit: toStr(q.deposit), payment_terms: q.payment_terms || "", notes: q.notes || "", valid_until: q.valid_until || "" });
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!id && settings && !h.valid_until)
      setH((p) => ({ ...p, valid_until: addDays(today(), Number(settings.quote_validity_days || 7)), payment_terms: p.payment_terms || settings.payment_terms_default || "" }));
  }, [settings, id, h.valid_until]);

  const subtotal = items.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const total = subtotal - (parseNum(h.discount) || 0);
  const cost = items.reduce((a, i) => a + i.qty * i.unit_cost + (i.fees_total || 0), 0);

  const save = async () => {
    if (!items.length) return toast("Adicione ao menos um item", "error");
    setBusy(true);
    const body = { ...h, client_id: h.client_id || null, production_days: parseNum(h.production_days), discount: parseNum(h.discount) || 0,
      deposit: parseNum(h.deposit) || 0, items, settings_snapshot: settings };
    try {
      const q = id ? await api.put(`/c/quotes/${id}`, body) : await api.post("/c/quotes", body);
      invalidateAll();
      toast("Orçamento salvo");
      router.replace(`/quote/${q.id}`);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={id ? "Editar orçamento" : "Novo orçamento"} keyboard testID="quote-edit-screen"
      footer={<Btn testID="quote-save-button" title={`Salvar · ${brl(total)}`} icon="content-save" onPress={save} loading={busy} />}>
      {loading ? <Loading /> : (
        <>
          <Card>
            <SelectField testID="quote-client-select" label="Cliente" value={h.client_id} onChange={(v) => set("client_id", v || "")} options={clients.map((c: any) => ({ value: c.id, label: c.name, sub: c.phone }))} />
            <Btn small variant="ghost" icon="account-plus-outline" title="Cadastrar novo cliente" onPress={() => router.push({ pathname: "/form", params: { col: "clients" } })} />
            <Text style={st.label}>Canal</Text>
            <Chips testID="quote-channel" options={O.channel} value={h.channel} onChange={(v) => set("channel", v)} />
          </Card>
          <Section title="Itens" right={<Btn testID="quote-add-item-button" small icon="calculator-variant-outline" title="Adicionar item" onPress={() => setCalcOpen(true)} />}>
            {items.length === 0 ? <Muted>Nenhum item. Use a calculadora para adicionar.</Muted> : items.map((i, idx) => (
              <Card key={idx} testID={`quote-item-${idx}`}>
                <View style={st.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.h}>{i.qty}x {i.name}</Text>
                    <Muted>{brl(i.unit_price)} un. · custo {brl(i.unit_cost)} · {i.customization || "sem personalização"}</Muted>
                  </View>
                  <IconBtn testID={`quote-item-remove-${idx}`} icon="delete-outline" onPress={() => setItems(items.filter((_, k) => k !== idx))} />
                </View>
              </Card>
            ))}
          </Section>
          <Card>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Field flex testID="quote-valid-until-input" label="Validade" value={h.valid_until} onChangeText={(v) => set("valid_until", v)} placeholder="AAAA-MM-DD" />
              <Field flex testID="quote-production-days-input" label="Prazo de produção" value={h.production_days} onChangeText={(v) => set("production_days", v)} numeric suffix="dias" />
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Field flex testID="quote-discount-input" label="Desconto" value={h.discount} onChangeText={(v) => set("discount", v)} numeric suffix="R$" />
              <Field flex testID="quote-deposit-input" label="Sinal" value={h.deposit} onChangeText={(v) => set("deposit", v)} numeric suffix="R$" />
            </View>
            <Field testID="quote-payment-terms-input" label="Condições de pagamento" value={h.payment_terms} onChangeText={(v) => set("payment_terms", v)} placeholder="Ex.: 50% sinal, saldo na entrega (Pix)" />
            <Field testID="quote-notes-input" label="Observações" value={h.notes} onChangeText={(v) => set("notes", v)} multiline />
          </Card>
          <Card>
            <Row label="Subtotal" value={brl(subtotal)} />
            <Row label="Total" value={brl(total)} bold testID="quote-total" />
            <Row label="Custo estimado + taxas" value={brl(cost)} />
            <Row label="Lucro estimado" value={brl(total - cost)} />
            <Row label="Saldo após sinal" value={brl(total - (parseNum(h.deposit) || 0))} />
          </Card>
        </>
      )}
      <Modal visible={calcOpen} animationType="slide" onRequestClose={() => setCalcOpen(false)}>
        <Screen title="Adicionar item" keyboard right={<IconBtn testID="calc-modal-close" icon="close" onPress={() => setCalcOpen(false)} />} back={false}>
          <Calculator initial={{ ...(h.channel === "shopee" ? {} : {}) }} onApply={(i) => { setItems((p) => [...p, i]); setCalcOpen(false); toast("Item adicionado"); }} />
        </Screen>
      </Modal>
    </Screen>
  );
}
