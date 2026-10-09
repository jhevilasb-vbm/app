import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { colors, radius, spacing } from "@/src/theme";
import { Btn } from "@/src/components/ui";

type ToastType = "success" | "error" | "info";
type ConfirmOpts = { title: string; message?: string; confirmText?: string; danger?: boolean };
const Ctx = createContext<{ toast: (m: string, t?: ToastType) => void; confirm: (o: ConfirmOpts) => Promise<boolean> }>(
  {} as any,
);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ text: string; type: ToastType } | null>(null);
  const timer = useRef<any>(null);
  const [conf, setConf] = useState<(ConfirmOpts & { resolve: (b: boolean) => void }) | null>(null);

  const toast = useCallback((text: string, type: ToastType = "success") => {
    clearTimeout(timer.current);
    setMsg({ text, type });
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConf({ ...o, resolve })), []);
  const close = (v: boolean) => {
    conf?.resolve(v);
    setConf(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      {msg && (
        <Animated.View
          entering={FadeInUp}
          exiting={FadeOutDown}
          pointerEvents="none"
          style={[s.toast, { top: insets.top + 12, borderLeftColor: msg.type === "error" ? colors.error : msg.type === "info" ? colors.info : colors.success }]}
        >
          <Text testID="toast-message" style={s.toastText}>{msg.text}</Text>
        </Animated.View>
      )}
      <Sheet visible={!!conf} onClose={() => close(false)} title={conf?.title}>
        {conf?.message ? <Text style={s.msg}>{conf.message}</Text> : null}
        <View style={s.row}>
          <View style={{ flex: 1 }}><Btn testID="confirm-cancel-button" title="Cancelar" variant="secondary" onPress={() => close(false)} /></View>
          <View style={{ flex: 1 }}>
            <Btn testID="confirm-ok-button" title={conf?.confirmText || "Confirmar"} variant={conf?.danger ? "danger" : "primary"} onPress={() => close(true)} />
          </View>
        </View>
      </Sheet>
    </Ctx.Provider>
  );
}

export const useFeedback = () => useContext(Ctx);

export function Sheet({ visible, onClose, title, children, testID }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="sheet-backdrop" />
        <View testID={testID} style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={s.handle} />
          {title ? <Text style={s.title}>{title}</Text> : null}
          <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
            {children}
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  toast: {
    position: "absolute", left: 16, right: 16, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md,
    padding: spacing.lg, borderLeftWidth: 4, zIndex: 999, elevation: 10,
  },
  toastText: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, maxHeight: "88%", borderTopWidth: 1, borderColor: colors.border,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: "700", marginBottom: spacing.md },
  msg: { color: colors.onSurfaceTertiary, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
});
