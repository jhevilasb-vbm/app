import React from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View, ViewStyle,
} from "react-native";
import MaterialDesignIcons from "@react-native-vector-icons/material-design-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

export type IconName = React.ComponentProps<typeof MaterialDesignIcons>["name"];
export const Icon = ({ name, size = 20, color = colors.onSurface }: { name: IconName; size?: number; color?: string }) => (
  <MaterialDesignIcons name={name} size={size} color={color} />
);

type ScreenProps = {
  title: string; subtitle?: string; back?: boolean; right?: React.ReactNode; children: React.ReactNode;
  refreshing?: boolean; onRefresh?: () => void; footer?: React.ReactNode; tab?: boolean; sub?: React.ReactNode;
  testID?: string; keyboard?: boolean;
};

export function Screen({ title, subtitle, back = true, right, children, refreshing, onRefresh, footer, tab, sub, testID, keyboard }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomChrome = tab ? (usesNativeTabs ? insets.bottom : 0) : insets.bottom;
  const content = (
    <View style={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: (footer ? spacing.lg : bottomChrome + spacing.xl) + (tab ? 72 : 0) }}>
      {children}
    </View>
  );
  const refresh = onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} /> : undefined;
  return (
    <View style={st.root} testID={testID}>
      <View style={[st.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={st.headerRow}>
          {back && (
            <Pressable testID="header-back-button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={st.backBtn} hitSlop={8}>
              <Icon name="arrow-left" size={22} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Text style={st.title} numberOfLines={1} testID="screen-title">{title}</Text>
            {subtitle ? <Text style={st.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
        {sub}
      </View>
      {keyboard ? (
        <KeyboardAwareScrollView bottomOffset={footer ? 90 : 24} keyboardShouldPersistTaps="handled" refreshControl={refresh}>
          {content}
        </KeyboardAwareScrollView>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" refreshControl={refresh}>{content}</ScrollView>
      )}
      {footer ? <View style={[st.footer, { paddingBottom: bottomChrome + spacing.md }]}>{footer}</View> : null}
    </View>
  );
}

export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void; testID?: string }) {
  if (onPress)
    return (
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [st.card, style as any, pressed && { opacity: 0.75, transform: [{ scale: 0.99 }] }]}>
        {children}
      </Pressable>
    );
  return <View testID={testID} style={[st.card, style as any]}>{children}</View>;
}

type BtnProps = { title: string; onPress?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; icon?: IconName; loading?: boolean; small?: boolean; testID?: string; disabled?: boolean };
export function Btn({ title, onPress, variant = "primary", icon, loading, small, testID, disabled }: BtnProps) {
  const bg = { primary: colors.brandPrimary, secondary: colors.surfaceTertiary, ghost: "transparent", danger: colors.error }[variant];
  const fg = { primary: colors.onBrandPrimary, secondary: colors.onSurface, ghost: colors.brand, danger: colors.onError }[variant];
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        st.btn, small && st.btnSmall, { backgroundColor: bg, borderColor: variant === "ghost" ? colors.border : bg },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={[st.btnText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconBtn({ icon, onPress, testID, color = colors.onSurface }: { icon: IconName; onPress: () => void; testID?: string; color?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={6} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={20} color={color} />
    </Pressable>
  );
}

type FieldProps = {
  label: string; value: string; onChangeText: (s: string) => void; numeric?: boolean; multiline?: boolean;
  placeholder?: string; hint?: string; testID?: string; secure?: boolean; email?: boolean; suffix?: string; flex?: boolean;
};
export function Field({ label, value, onChangeText, numeric, multiline, placeholder, hint, testID, secure, email, suffix, flex }: FieldProps) {
  return (
    <View style={[{ gap: 6 }, flex && { flex: 1 }]}>
      <Text style={st.label}>{label}</Text>
      <View style={st.inputWrap}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={numeric ? "decimal-pad" : email ? "email-address" : "default"}
          autoCapitalize={email || secure ? "none" : "sentences"}
          secureTextEntry={secure}
          multiline={multiline}
          style={[st.input, multiline && { minHeight: 80, textAlignVertical: "top", paddingTop: 12 }]}
        />
        {suffix ? <Text style={st.suffix}>{suffix}</Text> : null}
      </View>
      {hint ? <Text style={st.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Toggle({ label, value, onChange, testID, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; testID?: string; hint?: string }) {
  return (
    <View style={st.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={st.toggleLabel}>{label}</Text>
        {hint ? <Text style={st.hint}>{hint}</Text> : null}
      </View>
      <Switch testID={testID} value={value} onValueChange={onChange} trackColor={{ true: colors.brandSecondary, false: colors.borderStrong }} thumbColor={value ? colors.brand : colors.onSurfaceTertiary} />
    </View>
  );
}

export function Chips({ options, value, onChange, testID }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; testID?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipsRow} style={{ flexGrow: 0 }} testID={testID}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={o.value} testID={`${testID || "chip"}-${o.value}`} onPress={() => onChange(o.value)} style={[st.chip, sel && st.chipSel]}>
            <Text style={[st.chipText, sel && { color: colors.onBrandTertiary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const toneMap = {
  success: [colors.successSoft, colors.successText], warning: [colors.warningSoft, colors.warningText],
  error: [colors.errorSoft, colors.errorText], info: [colors.infoSoft, colors.onSurfaceTertiary], brand: [colors.brandTertiary, colors.brand],
};
export function Badge({ label, tone = "info", testID }: { label: string; tone?: keyof typeof toneMap; testID?: string }) {
  const [bg, fg] = toneMap[tone];
  return <View testID={testID} style={[st.badge, { backgroundColor: bg }]}><Text style={[st.badgeText, { color: fg }]}>{label}</Text></View>;
}

export function Section({ title, right, children, testID }: { title: string; right?: React.ReactNode; children: React.ReactNode; testID?: string }) {
  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      <View style={st.sectionHead}>
        <Text style={st.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Row({ label, value, bold, color, testID, hint }: { label: string; value: string; bold?: boolean; color?: string; testID?: string; hint?: string }) {
  return (
    <View style={st.row}>
      <View style={{ flex: 1 }}>
        <Text style={[st.rowLabel, bold && { color: colors.onSurface, fontWeight: "700" }]}>{label}</Text>
        {hint ? <Text style={st.hint}>{hint}</Text> : null}
      </View>
      <Text testID={testID} style={[st.rowValue, bold && { fontWeight: "800", fontSize: 16 }, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export function KPI({ label, value, sub, icon, color, onPress, testID }: { label: string; value: string; sub?: string; icon?: IconName; color?: string; onPress?: () => void; testID?: string }) {
  return (
    <Card onPress={onPress} style={st.kpi} testID={testID}>
      <View style={st.kpiHead}>
        {icon ? <View style={st.kpiIcon}><Icon name={icon} size={16} color={color || colors.brand} /></View> : null}
        <Text style={st.kpiLabel} numberOfLines={2}>{label}</Text>
      </View>
      <Text style={[st.kpiValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={st.hint} numberOfLines={2}>{sub}</Text> : null}
    </Card>
  );
}
export const Grid = ({ children }: { children: React.ReactNode }) => <View style={st.grid}>{children}</View>;

export function Empty({ icon = "package-variant-closed", title, text, action }: { icon?: IconName; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={st.empty} testID="empty-state">
      <View style={st.emptyIcon}><Icon name={icon} size={32} color={colors.brand} /></View>
      <Text style={st.emptyTitle}>{title}</Text>
      {text ? <Text style={[st.hint, { textAlign: "center" }]}>{text}</Text> : null}
      {action}
    </View>
  );
}
export const Loading = () => (
  <View style={{ padding: spacing.xxl, alignItems: "center" }} testID="loading-indicator"><ActivityIndicator color={colors.brand} size="large" /></View>
);
export function ErrorView({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return <Empty icon="alert-circle-outline" title="Falha ao carregar" text={message} action={<Btn testID="retry-button" title="Tentar novamente" variant="secondary" onPress={onRetry} />} />;
}
export function Notice({ text, tone = "warning", testID }: { text: string; tone?: "warning" | "info" | "error" | "success"; testID?: string }) {
  const [bg, fg] = toneMap[tone];
  return (
    <View testID={testID} style={[st.notice, { backgroundColor: bg }]}>
      <Icon name={tone === "info" ? "information-outline" : "alert-outline"} size={18} color={fg} />
      <Text style={[st.noticeText, { color: fg }]}>{text}</Text>
    </View>
  );
}
export function Fab({ onPress, testID, icon = "plus", label }: { onPress: () => void; testID?: string; icon?: IconName; label?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [st.fab, { bottom: (usesNativeTabs ? insets.bottom : 0) + 16 }, pressed && { transform: [{ scale: 0.95 }] }]}>
      <Icon name={icon} size={22} color={colors.onBrandPrimary} />
      {label ? <Text style={st.fabText}>{label}</Text> : null}
    </Pressable>
  );
}
export const Divider = () => <View style={{ height: 1, backgroundColor: colors.divider }} />;
export const Muted = ({ children, style }: { children: React.ReactNode; style?: any }) => <Text style={[st.hint, style]}>{children}</Text>;
export const H = ({ children, style }: { children: React.ReactNode; style?: any }) => <Text style={[st.h, style]}>{children}</Text>;

export const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  footer: { borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexDirection: "row", gap: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  btn: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1 },
  btnSmall: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  btnText: { fontSize: 15, fontWeight: "700" },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  label: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, minHeight: 48, color: colors.onSurface, fontSize: 15, paddingHorizontal: spacing.md },
  suffix: { color: colors.muted, paddingRight: spacing.md, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
  toggleLabel: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  chipsRow: { gap: spacing.sm, paddingVertical: 2, alignItems: "center" },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  chipSel: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  sectionTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", flex: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: 4 },
  rowLabel: { color: colors.onSurfaceTertiary, fontSize: 14 },
  rowValue: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.md },
  kpi: { width: "48.5%", gap: 6, padding: spacing.md },
  kpiHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  kpiIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  kpiLabel: { color: colors.muted, fontSize: 12, fontWeight: "600", flex: 1 },
  kpiValue: { color: colors.onSurface, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  empty: { alignItems: "center", padding: spacing.xl, gap: spacing.md },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  notice: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, alignItems: "flex-start" },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "500" },
  fab: { position: "absolute", right: 16, height: 56, minWidth: 56, paddingHorizontal: 18, borderRadius: 28, backgroundColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, elevation: 6 },
  fabText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  h: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
