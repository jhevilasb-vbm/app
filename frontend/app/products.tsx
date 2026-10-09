import React, { useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { fileUrl, useApi } from "@/src/api";
import { Badge, Card, Chips, Empty, ErrorView, Fab, Icon, Loading, Muted, Screen, st } from "@/src/components/ui";
import { brl, fnum, minutesLabel } from "@/src/format";
import { colors, radius } from "@/src/theme";

export default function Products() {
  const router = useRouter();
  const [cat, setCat] = useState("all");
  const { data = [], isLoading, isError, refetch, isRefetching } = useApi<any[]>("/products/overview");
  const cats = Array.from(new Set(data.map((p: any) => p.category).filter(Boolean))) as string[];
  const list = data.filter((p: any) => cat === "all" || (cat === "low" ? p.low : p.category === cat));
  return (
    <View style={{ flex: 1 }}>
      <Screen title="Catálogo de produtos" subtitle="Produtos, fichas técnicas e estoque acabado" refreshing={isRefetching} onRefresh={refetch} testID="products-screen"
        sub={<Chips testID="products-filter" value={cat} onChange={setCat} options={[{ value: "all", label: "Todos" }, { value: "low", label: "Estoque baixo" }, ...cats.map((c) => ({ value: c, label: c }))]} />}>
        {isLoading ? <Loading /> : isError ? <ErrorView onRetry={refetch} /> : list.length === 0 ? <Empty icon="shape-outline" title="Nenhum produto" text="Cadastre seus produtos com a ficha técnica de materiais." /> : list.map((p: any) => (
          <Card key={p.id} testID={`product-card-${p.id}`} onPress={() => router.push({ pathname: "/product-edit", params: { id: p.id } })}>
            <View style={st.listRow}>
              {p.photos?.[0] ? (
                <Image source={{ uri: fileUrl(p.photos[0]) }} style={{ width: 56, height: 56, borderRadius: radius.sm }} contentFit="cover" cachePolicy="disk" />
              ) : (
                <View style={{ width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}><Icon name="cube-outline" color={colors.brand} /></View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={st.h} numberOfLines={1}>{p.name}</Text>
                <Muted>{p.sku || "sem SKU"} · {fnum(p.weight_g)} g · {minutesLabel(p.print_minutes)}</Muted>
                <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                  <Badge label={`Disp. ${fnum(p.available)}`} tone={p.low ? "warning" : "success"} />
                  {p.reserved ? <Badge label={`Reserv. ${fnum(p.reserved)}`} tone="info" /> : null}
                  {p.in_production ? <Badge label={`Produção ${fnum(p.in_production)}`} tone="brand" /> : null}
                  {p.ready_to_ship ? <Badge label={`P/ envio ${fnum(p.ready_to_ship)}`} tone="success" /> : null}
                </View>
              </View>
              <Text style={st.h}>{brl(p.price)}</Text>
            </View>
          </Card>
        ))}
      </Screen>
      <Fab testID="new-product-fab" label="Novo" onPress={() => router.push("/product-edit")} />
    </View>
  );
}
