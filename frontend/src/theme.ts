// Design tokens (dark only) from /app/design_guidelines.json.
import { useMemo } from "react";
import { Appearance, StyleSheet } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#121212",
  onSurface: "#F5F5F5",
  surfaceSecondary: "#1A1A1A",
  onSurfaceSecondary: "#E0E0E0",
  surfaceTertiary: "#262626",
  onSurfaceTertiary: "#D4D4D4",
  surfaceInverse: "#EAEAEA",
  onSurfaceInverse: "#121212",
  muted: "#888888",
  brand: "#E5A93B",
  onBrand: "#121212",
  brandPrimary: "#E5A93B",
  onBrandPrimary: "#121212",
  brandSecondary: "#B38023",
  onBrandSecondary: "#F5F5F5",
  brandTertiary: "#3D3014",
  onBrandTertiary: "#E5A93B",
  success: "#39824B",
  onSuccess: "#FFFFFF",
  warning: "#D97706",
  onWarning: "#FFFFFF",
  error: "#B91C1C",
  onError: "#FFFFFF",
  info: "#64748B",
  onInfo: "#FFFFFF",
  border: "#2E2E2E",
  borderStrong: "#4A4A4A",
  divider: "#222222",
  successSoft: "#1C3323",
  warningSoft: "#3A2A10",
  errorSoft: "#3A1515",
  infoSoft: "#252B33",
  successText: "#6FCF88",
  errorText: "#F07272",
  warningText: "#F5A54A",
  scrim: "rgba(18,18,18,0.82)",
  overlay: "rgba(0,0,0,0.6)",
};

export type ThemeColors = typeof dark;
export const defaultScheme = "dark" satisfies ColorScheme;
export const themes: { light?: ThemeColors; dark: ThemeColors } = { dark };
export const colors = dark;

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  return { scheme: "dark", colors: dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
