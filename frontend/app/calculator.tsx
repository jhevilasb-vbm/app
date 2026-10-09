import React from "react";
import { useRouter } from "expo-router";
import { Screen } from "@/src/components/ui";
import { Calculator } from "@/src/components/calculator";
import { setPendingItem } from "@/src/draft";

export default function CalculatorScreen() {
  const router = useRouter();
  return (
    <Screen title="Calculadora de orçamentos" subtitle="Custos transparentes, margem e markup" keyboard testID="calculator-screen">
      <Calculator applyLabel="Criar orçamento com este item" onApply={(item) => { setPendingItem(item); router.push("/quote-edit"); }} />
    </Screen>
  );
}
