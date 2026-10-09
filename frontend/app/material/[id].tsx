import React, { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ApiError, api, invalidateAll, useApi } from "@/src/api";
import { Badge, Btn, Card, Chips, ErrorView, Field, Loading, Muted, Row, Screen, Section, st } from "@/src/components/ui";
import { Sheet, useFeedback } from "@/src/components/feedback";
import { MATERIAL_KIND, brl, fdatetime, fnum, parseNum } from "@/src/format";
import { colors } from "@/src/theme";

const TYPES = [{ value: "entrada", label: "Entrada" }, { value: "saida", label: "Saída" }, { value: "desperdicio", label: "Desperdício" }, { value: "ajuste", label: "Ajuste (contagem)" }];

export default function MaterialDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { data: m, isLoading, isError, refetch } = useApi<any>(`/c/materials/${id}`);
  const { data: moves = [] } = useApi<any[]>(`/stock/movements?material_id=${id}`);
  const [open, setOpen] = useState(false);
  const [mv, setMv] = useState({ type: "entrada", qty: "", unit_cost: "", note: "" });
  if (isLoading) return <Screen title="Item"><Loading /></Screen>;
  if (isError || !m) return <Screen title="Item"><ErrorView onRetry={refetch} /></Screen>;

  const isFil = m.unit === "g";
  const bought = moves.filter((x) => x.type === "entrada").reduce((a, x) => a + x.qty, 0);
  const used = moves.filter((x) => x.type === "saida").reduce((a, x) => a + x.qty, 0);
  const wasted = moves.filter((x) => x.type === "desperdicio").reduce((a, x) => a + x.qty, 0);

  const submit = async (force = false): Promise<void> => {
    const qty = parseNum(mv.qty);
    if (qty === null) return toast("Informe a quantidade", "error");
    let uc = parseNum(mv.unit_cost);
    if (uc !== null && isFil) uc = uc / 1000;
    try {
      await api.post("/stock/movement", { material_id: id, type: mv.type, qty, unit_cost: mv.type === "entrada" ? uc : null, note: mv.note, force });
      invalidateAll();
      setOpen(false);
      setMv({ type: "entrada", qty: "", unit_cost: "", note: "" });
      toast("Movimentação registrada");
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409 && (await confirm({ title: "Estoque ficará negativo", message: `${e.message}. Confirmar mesmo assim?`, danger: true })))
        return submit(true);
      if (!(e instanceof ApiError && e.status === 409)) toast(e.message, "error");
    }
  };

  return (
    <Screen title={m.name} subtitle={MATERIAL_KIND[m.kind]} testID="material-detail-screen"
      right={<Btn testID="material-edit-button" small variant="secondary" icon="pencil" title="Editar" onPress={() => router.push({ pathname: "/form", params: { col: "materials", id } })} />}>
      <Card>
        <View style={st.listRow}>
          <Text style={[st.h, { fontSize: 28, flex: 1 }]} testID="material-detail-qty">{fnum(m.qty, isFil ? 0 : 1)} {m.unit}</Text>
          {m.low ? <Badge label="Estoque baixo" tone="warning" /> : <Badge label="OK" tone="success" />}
        </View>
        <Row label="Custo médio" value={isFil ? `${brl(m.avg_cost * 1000)}/kg` : `${brl(m.avg_cost)}/${m.unit}`} />
        <Row label="Valor em estoque" value={brl(m.qty * m.avg_cost)} />
        <Row label="Estoque mínimo" value={m.min_qty != null ? `${fnum(m.min_qty)} ${m.unit}` : "Não definido"} />
        {isFil ? (
          <>
            <Row label="Peso comprado (histórico)" value={`${fnum(bought)} g`} />
            <Row label="Consumido em produção" value={`${fnum(used)} g`} />
            <Row label="Desperdício / falhas" value={`${fnum(wasted)} g`} color={colors.warningText} />
            <Row label="Restante estimado" value={`${fnum(m.qty)} g`} bold />
          </>
        ) : null}
        {m.location ? <Muted>Local: {m.location}</Muted> : null}
        <Btn testID="material-movement-button" icon="swap-vertical" title="Registrar movimentação" onPress={() => setOpen(true)} />
      </Card>
      <Section title="Histórico de movimentações">
        {moves.length === 0 ? <Muted>Sem movimentações.</Muted> : moves.map((x) => (
          <Card key={x.id}>
            <View style={st.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.h}>{TYPES.find((t) => t.value === x.type)?.label} · {x.type === "ajuste" ? `para ${fnum(x.qty)}` : fnum(x.qty, 1)} {m.unit}</Text>
                <Muted>{fdatetime(x.created_at)} · {x.created_by} {x.note ? `· ${x.note}` : ""}</Muted>
              </View>
              <Text style={[st.h, { color: x.delta >= 0 ? colors.successText : colors.errorText }]}>{x.delta >= 0 ? "+" : ""}{fnum(x.delta, 1)}</Text>
            </View>
          </Card>
        ))}
      </Section>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Movimentação de estoque">
        <Chips testID="movement-type" options={TYPES} value={mv.type} onChange={(t) => setMv({ ...mv, type: t })} />
        <Field testID="movement-qty-input" label={mv.type === "ajuste" ? `Quantidade contada (${m.unit})` : `Quantidade (${m.unit})`} value={mv.qty} onChangeText={(x) => setMv({ ...mv, qty: x })} numeric />
        {mv.type === "entrada" ? <Field testID="movement-cost-input" label={isFil ? "Custo (R$ por kg)" : `Custo por ${m.unit}`} value={mv.unit_cost} onChangeText={(x) => setMv({ ...mv, unit_cost: x })} numeric hint="Atualiza o custo médio de aquisição" /> : null}
        <Field testID="movement-note-input" label="Observação" value={mv.note} onChangeText={(x) => setMv({ ...mv, note: x })} />
        <Btn testID="movement-submit-button" title="Confirmar" onPress={() => submit()} />
      </Sheet>
    </Screen>
  );
}
