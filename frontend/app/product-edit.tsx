import React, { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, fileUrl, invalidateAll, useApi, useList } from "@/src/api";
import { Btn, Card, Chips, Field, Icon, IconBtn, Loading, Muted, Row, Screen, Section, Toggle, st } from "@/src/components/ui";
import { SelectField } from "@/src/components/select";
import { Sheet, useFeedback } from "@/src/components/feedback";
import { brl, fnum, parseNum, toStr } from "@/src/format";
import { colors, radius } from "@/src/theme";

const NUMS = ["price", "weight_g", "colors_count", "print_minutes", "assembly_minutes", "finishing_minutes", "custom_minutes", "min_stock", "margin_pct", "finished_stock"];

export default function ProductEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { data: mats = [] } = useList("materials");
  const { data: settings = {} } = useApi<any>("/settings");
  const [v, setV] = useState<Record<string, any>>({ printer_compat: "ambas", filament_type: "PLA", colors_count: "1", photos: [], bom: [], customizable: false });
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [calc, setCalc] = useState<any>(null);
  const [perm, setPerm] = useState<null | "ask" | "blocked">(null);
  const [adj, setAdj] = useState<string | null>(null);
  const set = (k: string, val: any) => setV((p) => ({ ...p, [k]: val }));

  useEffect(() => {
    if (!id) return;
    api.get(`/c/products/${id}`).then((p) => {
      const o: Record<string, any> = { ...p };
      NUMS.forEach((k) => (o[k] = toStr(p[k])));
      o.bom = (p.bom || []).map((b: any) => ({ ...b, qty: toStr(b.qty) }));
      o.photos = p.photos || [];
      setV(o);
      setLoading(false);
    });
  }, [id]);

  const laborMin = (parseNum(v.assembly_minutes) || 0) + (parseNum(v.finishing_minutes) || 0) + (parseNum(v.custom_minutes) || 0);
  const matMap = useMemo(() => Object.fromEntries(mats.map((m: any) => [m.id, m])), [mats]);
  const bomCost = (kind: "emb" | "other") => (v.bom || []).reduce((a: number, b: any) => {
    const m = matMap[b.material_id];
    if (!m || (kind === "emb") !== (m.kind === "embalagem")) return a;
    return a + (parseNum(b.qty) || 0) * (m.avg_cost || 0);
  }, 0);

  useEffect(() => {
    const fil = matMap[v.filament_material_id];
    const t = setTimeout(() => {
      api.post("/calc", {
        weight_g: parseNum(v.weight_g), print_minutes: parseNum(v.print_minutes), labor_minutes: laborMin, extras_unit: bomCost("other"),
        packaging_unit: bomCost("emb"), margin_pct: parseNum(v.margin_pct) ?? undefined, unit_price: parseNum(v.price) || undefined,
        ...(fil?.avg_cost ? { filament_cost_kg: fil.avg_cost * 1000 } : {}),
      }).then(setCalc).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.weight_g, v.print_minutes, laborMin, v.bom, v.margin_pct, v.price, v.filament_material_id, matMap]);

  const pickPhoto = async (skipCheck = false) => {
    if (Platform.OS !== "web" && !skipCheck) {
      const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!cur.granted) return setPerm(cur.canAskAgain ? "ask" : "blocked");
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, allowsEditing: true });
    if (r.canceled) return;
    const a = r.assets[0];
    const form = new FormData();
    const name = a.fileName || `foto.${(a.mimeType || "image/jpeg").split("/")[1]}`;
    if (Platform.OS === "web") form.append("file", await (await fetch(a.uri)).blob(), name);
    else form.append("file", { uri: a.uri, name, type: a.mimeType || "image/jpeg" } as any);
    try {
      toast("Enviando foto...", "info");
      const res = await api.post("/upload", form);
      setV((p) => ({ ...p, photos: [...(p.photos || []), res.path] }));
      toast("Foto adicionada");
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const requestPerm = async () => {
    const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (r.granted) {
      setPerm(null);
      pickPhoto(true);
    } else setPerm(r.canAskAgain ? "ask" : "blocked");
  };

  const save = async () => {
    if (!v.name) return toast("Informe o nome do produto", "error");
    setBusy(true);
    const body: Record<string, any> = { ...v, labor_minutes: laborMin };
    NUMS.forEach((k) => (body[k] = parseNum(v[k])));
    body.bom = (v.bom || []).filter((b: any) => b.material_id).map((b: any) => ({ material_id: b.material_id, qty: parseNum(b.qty) || 0 }));
    body.unit_cost_snapshot = calc?.unit_cost;
    try {
      if (id) await api.put(`/c/products/${id}`, body);
      else await api.post("/c/products", body);
      invalidateAll();
      toast("Produto salvo");
      router.back();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: "Excluir produto?", danger: true, confirmText: "Excluir" }))) return;
    await api.del(`/c/products/${id}`);
    invalidateAll();
    router.back();
  };
  const doAdjust = async () => {
    const d = parseNum(adj);
    if (!d) return;
    try {
      const r = await api.post(`/products/${id}/finished-adjust`, { delta: d, note: "Ajuste manual" });
      set("finished_stock", toStr(r.finished_stock));
      invalidateAll();
      setAdj(null);
      toast("Estoque acabado ajustado");
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  if (loading) return <Screen title="Produto"><Loading /></Screen>;
  const filaments = mats.filter((m: any) => m.kind === "filamento").map((m: any) => ({ value: m.id, label: m.name, sub: `${brl((m.avg_cost || 0) * 1000)}/kg` }));
  const others = mats.filter((m: any) => m.kind !== "filamento" && m.kind !== "ferramenta").map((m: any) => ({ value: m.id, label: m.name, sub: `${brl(m.avg_cost)}/${m.unit}` }));

  return (
    <Screen title={id ? "Editar produto" : "Novo produto"} keyboard testID="product-edit-screen"
      footer={<>{id ? <Btn testID="product-delete-button" variant="secondary" icon="delete-outline" title="Excluir" onPress={remove} /> : null}<Btn testID="product-save-button" title="Salvar" icon="content-save" onPress={save} loading={busy} /></>}>
      <Card>
        <Section title="Fotos">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(v.photos || []).map((p: string) => (
              <View key={p}>
                <Image source={{ uri: fileUrl(p) }} style={{ width: 88, height: 88, borderRadius: radius.md }} contentFit="cover" cachePolicy="disk" />
                <Pressable testID={`product-photo-remove-${p}`} onPress={() => set("photos", v.photos.filter((x: string) => x !== p))} style={{ position: "absolute", top: 4, right: 4, backgroundColor: colors.overlay, borderRadius: 12, padding: 2 }}>
                  <Icon name="close" size={16} />
                </Pressable>
              </View>
            ))}
            <Pressable testID="product-add-photo-button" onPress={() => pickPhoto()} style={{ width: 88, height: 88, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }}>
              <Icon name="camera-plus-outline" color={colors.brand} />
              <Muted>Adicionar</Muted>
            </Pressable>
          </ScrollView>
        </Section>
      </Card>
      <Card>
        <Field testID="product-name-input" label="Nome *" value={v.name || ""} onChangeText={(x) => set("name", x)} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Field flex testID="product-sku-input" label="SKU" value={v.sku || ""} onChangeText={(x) => set("sku", x)} />
          <Field flex testID="product-category-input" label="Categoria" value={v.category || ""} onChangeText={(x) => set("category", x)} />
        </View>
        <Field testID="product-description-input" label="Descrição" value={v.description || ""} onChangeText={(x) => set("description", x)} multiline />
        <Field testID="product-price-input" label="Preço de venda" value={v.price || ""} onChangeText={(x) => set("price", x)} numeric suffix="R$" />
        <Toggle testID="product-customizable-toggle" label="Produto personalizável" hint="Nome, texto, cor, dimensões definidos por pedido" value={!!v.customizable} onChange={(x) => set("customizable", x)} />
      </Card>
      <Card>
        <Section title="Impressão">
          <SelectField testID="product-filament-select" label="Filamento principal (estoque)" value={v.filament_material_id} onChange={(x) => set("filament_material_id", x)} options={filaments} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Field flex testID="product-weight-input" label="Peso de filamento" value={v.weight_g || ""} onChangeText={(x) => set("weight_g", x)} numeric suffix="g" />
            <Field flex testID="product-print-minutes-input" label="Tempo de impressão" value={v.print_minutes || ""} onChangeText={(x) => set("print_minutes", x)} numeric suffix="min" />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Field flex testID="product-color-input" label="Cor" value={v.color || ""} onChangeText={(x) => set("color", x)} />
            <Field flex testID="product-filament-type-input" label="Tipo" value={v.filament_type || ""} onChangeText={(x) => set("filament_type", x)} />
            <Field flex testID="product-colors-count-input" label="Nº cores" value={v.colors_count || ""} onChangeText={(x) => set("colors_count", x)} numeric />
          </View>
          <Text style={st.label}>Impressoras compatíveis</Text>
          <Chips testID="product-printer-compat" value={v.printer_compat} onChange={(x) => set("printer_compat", x)} options={[{ value: "ambas", label: "A1 e A1 Mini" }, { value: "a1", label: "Somente A1" }]} />
        </Section>
      </Card>
      <Card>
        <Section title="Mão de obra (min/un.)">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Field flex testID="product-assembly-input" label="Montagem" value={v.assembly_minutes || ""} onChangeText={(x) => set("assembly_minutes", x)} numeric />
            <Field flex testID="product-finishing-input" label="Acabamento" value={v.finishing_minutes || ""} onChangeText={(x) => set("finishing_minutes", x)} numeric />
            <Field flex testID="product-custom-input" label="Personaliz." value={v.custom_minutes || ""} onChangeText={(x) => set("custom_minutes", x)} numeric />
          </View>
        </Section>
      </Card>
      <Card>
        <Section title="Ficha técnica (por unidade)" right={<Btn testID="product-bom-add-button" small variant="secondary" icon="plus" title="Material" onPress={() => set("bom", [...(v.bom || []), { material_id: null, qty: "1" }])} />}>
          <Muted>Materiais complementares e embalagens. O filamento principal é calculado pelo peso.</Muted>
          {(v.bom || []).map((b: any, i: number) => (
            <View key={i} style={{ gap: 6 }}>
              <SelectField testID={`product-bom-material-${i}`} label={`Material ${i + 1}`} value={b.material_id} options={others}
                onChange={(x) => set("bom", v.bom.map((y: any, k: number) => (k === i ? { ...y, material_id: x } : y)))} />
              <View style={[st.listRow]}>
                <Field flex testID={`product-bom-qty-${i}`} label="Quantidade" value={b.qty} numeric suffix={matMap[b.material_id]?.unit}
                  onChangeText={(x) => set("bom", v.bom.map((y: any, k: number) => (k === i ? { ...y, qty: x } : y)))} />
                <Text style={[st.h, { marginTop: 18 }]}>{brl((parseNum(b.qty) || 0) * (matMap[b.material_id]?.avg_cost || 0))}</Text>
                <IconBtn testID={`product-bom-remove-${i}`} icon="delete-outline" onPress={() => set("bom", v.bom.filter((_: any, k: number) => k !== i))} />
              </View>
            </View>
          ))}
          <Row label="Materiais complementares" value={brl(bomCost("other"))} />
          <Row label="Embalagem" value={brl(bomCost("emb"))} />
        </Section>
      </Card>
      <Card>
        <Section title="Estoque e margem">
          <View style={{ flexDirection: "row", gap: 12 }}>
            {!id ? <Field flex testID="product-finished-stock-input" label="Estoque acabado inicial" value={v.finished_stock || ""} onChangeText={(x) => set("finished_stock", x)} numeric /> : null}
            <Field flex testID="product-min-stock-input" label="Estoque mínimo" value={v.min_stock || ""} onChangeText={(x) => set("min_stock", x)} numeric />
            <Field flex testID="product-margin-input" label="Margem desejada" value={v.margin_pct || ""} onChangeText={(x) => set("margin_pct", x)} numeric suffix="%" />
          </View>
          {id ? (
            <View style={st.listRow}>
              <Text style={[st.h, { flex: 1 }]}>Estoque acabado: {fnum(parseNum(v.finished_stock))} un.</Text>
              <Btn testID="product-adjust-stock-button" small variant="secondary" title="Ajustar" onPress={() => setAdj("")} />
            </View>
          ) : null}
        </Section>
      </Card>
      {calc ? (
        <Card style={{ backgroundColor: colors.surfaceTertiary }} testID="product-cost-card">
          <Section title="Custo calculado">
            {calc.warnings?.length ? <Muted>Estimativa — faltam premissas: {calc.warnings.join(", ")}</Muted> : null}
            <Row label="Custo de produção / un." value={brl(calc.unit_cost)} bold testID="product-unit-cost" />
            <Row label="Preço mínimo (margem desejada)" value={calc.min_price ? brl(calc.min_price) : "—"} />
            <Row label="Preço sugerido" value={calc.recommended_price ? brl(calc.recommended_price) : "—"} color={colors.brand} />
            {parseNum(v.price) ? <Row label="Margem com o preço atual" value={`${fnum(calc.margin_real_pct, 1)}% · lucro ${brl(calc.profit_unit)}`} /> : null}
            {calc.recommended_price ? <Btn small variant="ghost" title="Usar preço sugerido" onPress={() => set("price", toStr(calc.recommended_price))} /> : null}
            <Muted>Taxas padrão de venda: {fnum(settings.marketplace_pct || 0, 1)}% + {fnum(settings.payment_pct || 0, 1)}%</Muted>
          </Section>
        </Card>
      ) : null}

      <Sheet visible={perm !== null} onClose={() => setPerm(null)} title="Acesso às fotos">
        <Text style={{ color: colors.onSurfaceTertiary }}>Precisamos acessar sua galeria para adicionar fotos dos produtos ao catálogo.</Text>
        {perm === "blocked" ? (
          <Btn testID="photo-open-settings-button" title="Abrir configurações" icon="cog" onPress={() => { Linking.openSettings(); setPerm(null); }} />
        ) : (
          <Btn testID="photo-allow-button" title="Permitir acesso" onPress={requestPerm} />
        )}
      </Sheet>
      <Sheet visible={adj !== null} onClose={() => setAdj(null)} title="Ajustar estoque acabado">
        <Field testID="product-adjust-input" label="Quantidade (+ entrada / − saída)" value={adj || ""} onChangeText={setAdj} placeholder="Ex.: 5 ou -2" />
        <Btn testID="product-adjust-submit" title="Confirmar ajuste" onPress={doAdjust} />
      </Sheet>
    </Screen>
  );
}
