import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, invalidateAll, useApi } from "@/src/api";
import { Badge, Btn, Card, Chips, ErrorView, Field, Loading, Muted, Row, Screen, Section, st } from "@/src/components/ui";
import { useFeedback } from "@/src/components/feedback";
import { CHANNELS, CLIENT_STAGE, ORDER_STATUS, QUOTE_STATUS, brl, fdate, fdatetime, tone } from "@/src/format";

export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useFeedback();
  const { data: c, isLoading, isError, refetch } = useApi<any>(`/c/clients/${id}`);
  const { data: hist } = useApi<any>(`/clients/${id}/history`);
  const [note, setNote] = useState("");
  const [rem, setRem] = useState("");
  if (isLoading) return <Screen title="Cliente"><Loading /></Screen>;
  if (isError || !c) return <Screen title="Cliente"><ErrorView onRetry={refetch} /></Screen>;

  const addContact = async () => {
    if (!note.trim()) return toast("Escreva o registro do contato", "error");
    if (rem && !/^\d{4}-\d{2}-\d{2}$/.test(rem)) return toast("Data do lembrete: AAAA-MM-DD", "error");
    await api.post(`/clients/${id}/contacts`, { note, reminder_date: rem || null });
    setNote("");
    setRem("");
    invalidateAll();
    toast("Contato registrado");
  };
  const stage = async (s: string) => {
    await api.put(`/c/clients/${id}`, { stage: s });
    invalidateAll();
  };
  const spent = (hist?.orders || []).filter((o: any) => o.status !== "cancelado").reduce((a: number, o: any) => a + o.total, 0);

  return (
    <Screen title={c.name} subtitle={c.company || CHANNELS[c.origin] || ""} testID="client-detail-screen"
      right={<Btn testID="client-edit-button" small variant="secondary" icon="pencil" title="Editar" onPress={() => router.push({ pathname: "/form", params: { col: "clients", id } })} />}>
      <Card>
        {c.phone ? <Row label="Telefone" value={c.phone} /> : null}
        {c.email ? <Row label="E-mail" value={c.email} /> : null}
        {c.address ? <Muted>{c.address}</Muted> : null}
        <Row label="Total comprado" value={brl(spent)} bold />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {c.whatsapp || c.phone ? (
            <View style={{ flex: 1 }}><Btn testID="client-whatsapp-button" small variant="secondary" icon="whatsapp" title="Abrir WhatsApp" onPress={() => Linking.openURL(`https://wa.me/55${String(c.whatsapp || c.phone).replace(/\D/g, "")}`)} /></View>
          ) : null}
          <View style={{ flex: 1 }}><Btn testID="client-new-quote-button" small icon="file-document-edit-outline" title="Novo orçamento" onPress={() => router.push({ pathname: "/quote-edit", params: { client_id: id } })} /></View>
        </View>
      </Card>
      <Card>
        <Text style={st.label}>Etapa do atendimento</Text>
        <Chips testID="client-stage" options={Object.entries(CLIENT_STAGE).map(([value, label]) => ({ value, label }))} value={c.stage || "novo_contato"} onChange={stage} />
      </Card>
      <Card>
        <Section title="Registrar contato / lembrete">
          <Field testID="client-contact-note-input" label="O que foi conversado" value={note} onChangeText={setNote} multiline />
          <Field testID="client-reminder-date-input" label="Lembrete de acompanhamento (opcional)" value={rem} onChangeText={setRem} placeholder="AAAA-MM-DD" />
          <Btn testID="client-add-contact-button" small title="Salvar registro" onPress={addContact} />
        </Section>
      </Card>
      {(c.reminders || []).filter((r: any) => !r.done).length ? (
        <Section title="Lembretes pendentes">
          {c.reminders.filter((r: any) => !r.done).map((r: any) => (
            <Card key={r.id}>
              <View style={st.listRow}>
                <View style={{ flex: 1 }}><Text style={st.h}>{fdate(r.date)}</Text><Muted>{r.note}</Muted></View>
                <Btn testID={`reminder-done-${r.id}`} small variant="secondary" title="Feito" onPress={async () => { await api.post(`/clients/${id}/reminders/${r.id}/done`); invalidateAll(); }} />
              </View>
            </Card>
          ))}
        </Section>
      ) : null}
      <Section title="Histórico de contatos">
        {(c.contacts || []).length === 0 ? <Muted>Nenhum contato registrado.</Muted> : [...c.contacts].reverse().map((x: any) => (
          <Card key={x.id}><Muted>{fdatetime(x.at)} · {x.by}</Muted><Text style={{ color: "#E0E0E0" }}>{x.note}</Text></Card>
        ))}
      </Section>
      <Section title="Pedidos">
        {(hist?.orders || []).map((o: any) => (
          <Card key={o.id} onPress={() => router.push(`/order/${o.id}`)}>
            <View style={st.listRow}><Text style={[st.h, { flex: 1 }]}>{o.number} · {fdate(o.order_date)}</Text><Text style={st.h}>{brl(o.total)}</Text><Badge label={ORDER_STATUS[o.status]} tone={tone(o.status)} /></View>
          </Card>
        ))}
      </Section>
      <Section title="Orçamentos">
        {(hist?.quotes || []).map((q: any) => (
          <Card key={q.id} onPress={() => router.push(`/quote/${q.id}`)}>
            <View style={st.listRow}><Text style={[st.h, { flex: 1 }]}>{q.number} · {fdate(q.quote_date)}</Text><Text style={st.h}>{brl(q.total)}</Text><Badge label={QUOTE_STATUS[q.status]} tone={tone(q.status)} /></View>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
