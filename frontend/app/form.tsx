import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, invalidateAll, useList } from "@/src/api";
import { SCHEMAS, FieldDef } from "@/src/schemas";
import { Text, View } from "react-native";
import { Btn, Chips, Field, Loading, Screen, Toggle, st } from "@/src/components/ui";
import { SelectField } from "@/src/components/select";
import { useFeedback } from "@/src/components/feedback";
import { parseNum, toStr } from "@/src/format";

function RefField({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  const { data = [] } = useList(f.ref!.col);
  const opts = data.filter(f.ref!.filter || (() => true)).map((x: any) => ({
    value: String(x[f.ref!.valueKey || "id"]), label: String(x[f.ref!.labelKey || "name"] ?? x.name ?? x.number ?? "—") + (x.client_name ? ` · ${x.client_name}` : ""),
  }));
  return <SelectField testID={`form-${f.key}-select`} label={f.label} value={value} options={opts} onChange={(v) => onChange(v)} />;
}

export default function FormScreen() {
  const { col, id, preset } = useLocalSearchParams<{ col: string; id?: string; preset?: string }>();
  const schema = SCHEMAS[col];
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [v, setV] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const init: Record<string, any> = {};
    schema.fields.forEach((f) => {
      if (f.default !== undefined) init[f.key] = f.type === "bool" ? f.default : String(f.default);
    });
    if (preset) Object.assign(init, JSON.parse(preset));
    if (id) {
      api.get(`/c/${col}/${id}`).then((d) => {
        const out: Record<string, any> = {};
        schema.fields.forEach((f) => (out[f.key] = f.type === "bool" ? !!d[f.key] : ["number", "money"].includes(f.type || "") ? toStr(d[f.key]) : d[f.key] ?? ""));
        setV(out);
        setLoading(false);
      });
    } else setV(init);
  }, [id, col, preset, schema]);

  const set = (k: string, val: any) => setV((p) => ({ ...p, [k]: val }));
  const fields = schema.fields.filter((f) => !(id && f.createOnly));

  const save = async () => {
    const body: Record<string, any> = preset && !id ? JSON.parse(preset) : {};
    for (const f of fields) {
      let val = v[f.key];
      if (["number", "money"].includes(f.type || "")) val = parseNum(val);
      if (f.type === "date" || f.type === "ref" || f.type === "select") val = val || null;
      if (f.required && (val === null || val === undefined || val === "")) return toast(`Preencha: ${f.label}`, "error");
      if (f.type === "date" && val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) return toast(`Data inválida em ${f.label} (use AAAA-MM-DD)`, "error");
      body[f.key] = val;
    }
    setBusy(true);
    try {
      if (id) await api.put(`/c/${col}/${id}`, body);
      else await api.post(`/c/${col}`, body);
      invalidateAll();
      toast("Salvo com sucesso");
      router.back();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: "Excluir registro?", message: "O registro será arquivado e deixará de aparecer nas listas. O histórico é mantido.", confirmText: "Excluir", danger: true }))) return;
    try {
      await api.del(`/c/${col}/${id}`);
      invalidateAll();
      toast("Excluído");
      router.back();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <Screen
      title={`${id ? "Editar" : "Novo"}: ${schema.title}`}
      keyboard
      footer={
        <>
          {id ? <Btn testID="form-delete-button" title="Excluir" variant="secondary" icon="delete-outline" onPress={remove} /> : null}
          <Btn testID="form-save-button" title="Salvar" icon="content-save" onPress={save} loading={busy} />
        </>
      }
    >
      {loading ? <Loading /> : fields.map((f) => {
        const t = f.type || "text";
        if (t === "bool") return <Toggle key={f.key} testID={`form-${f.key}-toggle`} label={f.label} hint={f.hint} value={!!v[f.key]} onChange={(x) => set(f.key, x)} />;
        if (t === "select") return (
          <View key={f.key} style={{ gap: 6 }}>
            <Text style={st.label}>{f.label}{f.required ? " *" : ""}</Text>
            <Chips testID={`form-${f.key}`} options={f.options!} value={v[f.key] || ""} onChange={(x) => set(f.key, x)} />
          </View>
        );
        if (t === "ref") return <RefField key={f.key} f={f} value={v[f.key]} onChange={(x) => set(f.key, x)} />;
        return (
          <Field key={f.key} testID={`form-${f.key}-input`} label={f.label + (f.required ? " *" : "")} value={String(v[f.key] ?? "")} onChangeText={(x) => set(f.key, x)}
            numeric={t === "number" || t === "money"} multiline={t === "multiline"} email={t === "email"} hint={f.hint}
            placeholder={t === "date" ? "AAAA-MM-DD" : t === "money" ? "0,00" : undefined} suffix={t === "money" ? "R$" : f.suffix} />
        );
      })}
    </Screen>
  );
}
