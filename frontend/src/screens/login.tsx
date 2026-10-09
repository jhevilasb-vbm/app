import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { Btn, Field, Notice } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1652120268427-9ba66e870467?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    if (!email || !password) return setErr("Informe e-mail e senha.");
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setErr(e.message || "Falha no login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={["rgba(18,18,18,0.3)", colors.surface]} style={StyleSheet.absoluteFill} />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[s.content, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={s.logo}><Text style={s.logoText}>VBM</Text></View>
        <Text style={s.brand}>VBM GESTÃO 3D</Text>
        <Text style={s.tag}>Gestão completa da sua impressão 3D</Text>
        <View style={s.card}>
          <Field testID="login-email-input" label="E-mail" value={email} onChangeText={setEmail} email placeholder="voce@email.com" />
          <Field testID="login-password-input" label="Senha" value={password} onChangeText={setPassword} secure placeholder="••••••••" />
          {err ? <Notice testID="login-error" tone="error" text={err} /> : null}
          <Btn testID="login-submit-button" title="Entrar" icon="login" onPress={submit} loading={busy} />
        </View>
        <Text style={s.foot}>Acesso restrito aos sócios da VBM 3D</Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.xl, gap: spacing.md, flexGrow: 1, justifyContent: "center" },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  logoText: { color: colors.onBrandPrimary, fontWeight: "900", fontSize: 20, letterSpacing: 1 },
  brand: { color: colors.onSurface, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  tag: { color: colors.onSurfaceTertiary, fontSize: 15, marginBottom: spacing.lg },
  card: { backgroundColor: colors.scrim, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg, borderWidth: 1, borderColor: colors.border },
  foot: { color: colors.muted, textAlign: "center", fontSize: 12, marginTop: spacing.md },
});
