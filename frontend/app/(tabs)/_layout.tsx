import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/components/ui";
import { colors } from "@/src/theme";

export default function TabsLayout() {
  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brand}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" />
          <NativeTabs.Trigger.Label>Início</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="quotes">
          <NativeTabs.Trigger.Icon sf="doc.text.fill" />
          <NativeTabs.Trigger.Label>Orçamentos</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="orders">
          <NativeTabs.Trigger.Icon sf="bag.fill" />
          <NativeTabs.Trigger.Label>Pedidos</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="more">
          <NativeTabs.Trigger.Icon sf="ellipsis.circle.fill" />
          <NativeTabs.Trigger.Label>Mais</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }
  const tab = (name: string, title: string, icon: any, iconOn: any) => (
    <Tabs.Screen
      name={name}
      options={{
        title,
        tabBarButtonTestID: `tab-${name}`,
        tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => <Icon name={focused ? iconOn : icon} color={color} size={24} />,
      } as any}
    />
  );
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      {tab("index", "Início", "view-dashboard-outline", "view-dashboard")}
      {tab("quotes", "Orçamentos", "file-document-outline", "file-document")}
      {tab("orders", "Pedidos", "shopping-outline", "shopping")}
      {tab("more", "Mais", "dots-grid", "dots-grid")}
    </Tabs>
  );
}
