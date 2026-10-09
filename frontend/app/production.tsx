import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ApiError, api, invalidateAll, useApi, useList } from "@/src/api";
import { Badge, Btn, Card, Chips, Empty, ErrorView, Fab, Field, Loading, Muted, Screen, Section, Toggle, st } from "@/src/components/ui";
import { Sheet, useFeedback } from "@/src/components/feedback";
import { JOB_STATUS, fdate, fdatetime, fnum, minutesLabel, parseNum, toStr, tone } from "@/src/format";
import { colors, radius, spacing } from "@/src/theme";

const IMG = "https://images.unsplash.com/photo-1762579318096-8e9bc45b8feb?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Production() {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { data, isLoading, isError, refetch, isRefetching } = useApi<any>("/production/schedule");
  const { data: jobs = [] } = useList("jobs");
  const [tab, setTab] = useState<string>("");
  const [done, setDone] = useState<any>(null);
  const [c, setC] = useState({ status: "concluido", real_weight: "", real_minutes: "", approved_qty: "", defect_qty: "0", redo_qty: "0", failure_reason: "", add_to_stock: true });

  const printers = data?.printers || [];
  const cur = tab || printers[0]?.id || "none";
  const lane = cur === "none" ? (data?.unassigned || []) : printers.find((p: any) => p.id === cur)?.jobs || [];
  const history = jobs.filter((j: any) => ["concluido", "falhou", "cancelado"].includes(j.status) && (cur === "none" ? !j.printer_id : j.printer_id === cur)).slice(0, 15);

  const act = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      invalidateAll();
      toast(ok);
      return true;
    } catch (e: any) {
      return e;
    }
  };
  const openDone = (j: any) => {
    setC({ status: "concluido", real_weight: toStr(j.est_weight), real_minutes: "", approved_qty: toStr(j.qty), defect_qty: "0", redo_qty: "0", failure_reason: "", add_to_stock: true });
    setDone(j);
  };
  const submitDone = async (force = false): Promise<void> => {
    const body = { ...c, force, real_weight: parseNum(c.real_weight), real_minutes: parseNum(c.real_minutes), approved_qty: parseNum(c.approved_qty) || 0, defect_qty: parseNum(c.defect_qty) || 0, redo_qty: parseNum(c.redo_qty) || 0 };
    const r = await act(() => api.post(`/jobs/${done.id}/complete`, body), c.status === "concluido" ? "Produção concluída · estoque atualizado" : "Registrado");
    if (r === true) return setDone(null);
    if (r instanceof ApiError && r.status === 409 && !r.message.includes("já foi") && (await confirm({ title: "Estoque insuficiente", message: `${r.message}. Baixar mesmo assim (estoque ficará negativo)?`, danger: true })))
      return submitDone(true);
    toast(r.message, "error");
  };
  const cancel = async (j: any) => {
    if (!(await confirm({ title: "Cancelar trabalho?", danger: true }))) return;
    const r = await act(() => api.post(`/jobs/${j.id}/complete`, { status: "cancelado" }), "Trabalho cancelado");
    if (r !== true) toast(r.message, "error");
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Produção 3D" subtitle="Fila, agenda e previsão de conclusão" refreshing={isRefetching} onRefresh={refetch} testID="production-screen"
        right={<Btn testID="production-auto-assign-button" small variant="secondary" icon="auto-fix" title="Distribuir" onPress={async () => { const r = await api.post("/production/auto-assign"); invalidateAll(); toast(`${r.assigned} trabalho(s) distribuído(s)`); }} />}
        sub={<Chips testID="production-printer-tabs" value={cur} onChange={setTab} options={[...printers.map((p: any) => ({ value: p.id, label: `${p.name} (${p.jobs.length})` })), { value: "none", label: `Sem impressora (${data?.unassigned?.length || 0})` }]} />}>
        {isLoading ? <Loading /> : isError ? <ErrorView onRetry={refetch} /> : (
          <>
            {cur !== "none" ? (
              <View style={s.hero}>
                <Image source={{ uri: IMG }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <LinearGradient colors={["rgba(18,18,18,0.1)", colors.scrim]} style={StyleSheet.absoluteFill} />
                <Text style={s.heroT}>{printers.find((p: any) => p.id === cur)?.name}</Text>
                <Text style={s.heroS}>{printers.find((p: any) => p.id === cur)?.free_at ? `Livre a partir de ${fdatetime(printers.find((p: any) => p.id === cur)?.free_at)}` : "Disponível agora"} · {fnum((printers.find((p: any) => p.id === cur)?.hours_used || 0) + (printers.find((p: any) => p.id === cur)?.initial_hours || 0), 1)} h de uso</Text>
              </View>
            ) : null}
            <Section title="Fila">
              {lane.length === 0 ? <Empty icon="printer-3d" title="Nenhum trabalho na fila" text="Gere trabalhos a partir de um pedido ou crie manualmente." /> : lane.map((j: any) => (
                <Card key={j.id} testID={`job-card-${j.id}`}>
                  <View style={st.listRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={st.h}>{j.qty}x {j.product_name || "Trabalho avulso"}</Text>
                      <Muted>{j.order_number ? `Pedido ${j.order_number} · ` : ""}{fnum(j.est_weight)} g · {minutesLabel(j.est_minutes)}{j.due_date ? ` · prazo ${fdate(j.due_date)}` : ""}</Muted>
                      {j.pred_end ? <Muted>Previsão: {fdatetime(j.pred_start)} → {fdatetime(j.pred_end)}</Muted> : null}
                    </View>
                    <View style={{ gap: 4, alignItems: "flex-end" }}>
                      <Badge label={JOB_STATUS[j.status]} tone={tone(j.status)} />
                      {j.late ? <Badge label="Atrasará" tone="error" /> : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    {j.status !== "imprimindo" ? <Btn testID={`job-start-${j.id}`} small icon="play" title="Iniciar" onPress={async () => { const r = await act(() => api.post(`/jobs/${j.id}/start`), "Impressão iniciada"); if (r !== true) toast(r.message, "error"); }} /> : null}
                    <Btn testID={`job-complete-${j.id}`} small variant={j.status === "imprimindo" ? "primary" : "secondary"} icon="check" title="Finalizar" onPress={() => openDone(j)} />
                    <Btn testID={`job-edit-${j.id}`} small variant="secondary" icon="pencil" title="Editar" onPress={() => router.push({ pathname: "/form", params: { col: "jobs", id: j.id } })} />
                    <Btn testID={`job-cancel-${j.id}`} small variant="ghost" title="Cancelar" onPress={() => cancel(j)} />
                  </View>
                </Card>
              ))}
            </Section>
            <Section title="Histórico recente">
              {history.length === 0 ? <Muted>Nenhum trabalho finalizado.</Muted> : history.map((j: any) => (
                <Card key={j.id}>
                  <View style={st.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.h}>{j.qty}x {j.product_name || "Trabalho"}</Text>
                      <Muted>{fdatetime(j.end_time)} · {fnum(j.real_weight)} g · {minutesLabel(j.real_minutes)} · ok {fnum(j.approved_qty)} / defeito {fnum(j.defect_qty)}{j.failure_reason ? ` · ${j.failure_reason}` : ""}</Muted>
                    </View>
                    <Badge label={JOB_STATUS[j.status]} tone={tone(j.status)} />
                  </View>
                </Card>
              ))}
            </Section>
            <Muted>Registros manuais. A estrutura está pronta para uma futura integração com a Bambu Lab, caso seja tecnicamente viável.</Muted>
          </>
        )}
      </Screen>
      <Fab testID="new-job-fab" label="Trabalho" onPress={() => router.push({ pathname: "/form", params: { col: "jobs", ...(cur !== "none" ? { preset: JSON.stringify({ printer_id: cur }) } : {}) } })} />
      <Sheet visible={!!done} onClose={() => setDone(null)} title="Finalizar trabalho">
        <Chips testID="complete-status" value={c.status} onChange={(x) => setC({ ...c, status: x })} options={[{ value: "concluido", label: "Concluído" }, { value: "falhou", label: "Falhou" }]} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Field flex testID="complete-weight-input" label="Peso real (g)" value={c.real_weight} onChangeText={(x) => setC({ ...c, real_weight: x })} numeric />
          <Field flex testID="complete-minutes-input" label="Tempo real (min)" value={c.real_minutes} onChangeText={(x) => setC({ ...c, real_minutes: x })} numeric placeholder="auto" />
        </View>
        {c.status === "concluido" ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Field flex testID="complete-approved-input" label="Aprovadas" value={c.approved_qty} onChangeText={(x) => setC({ ...c, approved_qty: x })} numeric />
            <Field flex testID="complete-defect-input" label="Defeito" value={c.defect_qty} onChangeText={(x) => setC({ ...c, defect_qty: x })} numeric />
            <Field flex testID="complete-redo-input" label="Refeitas" value={c.redo_qty} onChangeText={(x) => setC({ ...c, redo_qty: x })} numeric />
          </View>
        ) : null}
        <Field testID="complete-reason-input" label="Observações / motivo da falha" value={c.failure_reason} onChangeText={(x) => setC({ ...c, failure_reason: x })} />
        {c.status === "concluido" ? <Toggle testID="complete-add-stock-toggle" label="Adicionar aprovadas ao estoque de acabados" value={c.add_to_stock} onChange={(x) => setC({ ...c, add_to_stock: x })} /> : null}
        <Muted>A baixa do filamento (peso real) e dos materiais da ficha técnica é feita uma única vez.</Muted>
        <Btn testID="complete-submit-button" title="Confirmar e baixar estoque" onPress={() => submitDone()} />
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { height: 130, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end", padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  heroT: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  heroS: { color: colors.onSurfaceTertiary, fontSize: 12 },
});
