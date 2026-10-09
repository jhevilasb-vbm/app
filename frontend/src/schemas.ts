import { O } from "@/src/format";

export type FieldDef = {
  key: string; label: string; type?: "text" | "number" | "money" | "date" | "select" | "ref" | "multiline" | "bool" | "email";
  options?: { value: string; label: string }[]; ref?: { col: string; labelKey?: string; filter?: (x: any) => boolean; valueKey?: string };
  required?: boolean; hint?: string; createOnly?: boolean; suffix?: string; default?: any;
};
export type Schema = { title: string; fields: FieldDef[] };

const yesno = [{ value: "ambas", label: "A1 e A1 Mini" }, { value: "a1", label: "Somente A1 (peça grande)" }];

export const SCHEMAS: Record<string, Schema> = {
  clients: {
    title: "Cliente",
    fields: [
      { key: "name", label: "Nome", required: true },
      { key: "phone", label: "Telefone" },
      { key: "whatsapp", label: "WhatsApp (com DDD)", hint: "Somente números, ex.: 11999999999" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "company", label: "Empresa" },
      { key: "origin", label: "Origem do contato", type: "select", options: [...O.channel, { value: "indicacao", label: "Indicação" }] },
      { key: "stage", label: "Etapa do atendimento", type: "select", options: O.stage, default: "novo_contato" },
      { key: "address", label: "Endereço", type: "multiline" },
      { key: "notes", label: "Observações", type: "multiline" },
    ],
  },
  suppliers: {
    title: "Fornecedor",
    fields: [
      { key: "name", label: "Nome", required: true },
      { key: "contact", label: "Contato" },
      { key: "phone", label: "Telefone / WhatsApp" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "website", label: "Site / loja" },
      { key: "supplies", label: "O que fornece" },
      { key: "lead_days", label: "Prazo médio de entrega", type: "number", suffix: "dias" },
      { key: "notes", label: "Observações", type: "multiline" },
    ],
  },
  materials: {
    title: "Item de estoque",
    fields: [
      { key: "name", label: "Nome do item", required: true, hint: "Ex.: PLA Preto Bambu 1kg, Argola 25mm" },
      { key: "kind", label: "Tipo", type: "select", options: O.kind, default: "filamento", required: true },
      { key: "unit", label: "Unidade de medida", type: "select", default: "g", options: [
        { value: "g", label: "Gramas (g)" }, { value: "un", label: "Unidade (un)" }, { value: "m", label: "Metros (m)" }, { value: "ml", label: "Mililitros (ml)" }, { value: "pct", label: "Pacote" }] },
      { key: "qty", label: "Quantidade inicial", type: "number", createOnly: true, hint: "Para filamento em gramas: rolo de 1kg = 1000" },
      { key: "unit_cost", label: "Custo por unidade de medida", type: "money", createOnly: true, hint: "Filamento em gramas: R$ 100/kg = 0,10 por grama" },
      { key: "min_qty", label: "Estoque mínimo", type: "number", hint: "Gera alerta e lista de compras ao atingir" },
      { key: "supplier_id", label: "Fornecedor", type: "ref", ref: { col: "suppliers" } },
      { key: "brand", label: "Marca" },
      { key: "color", label: "Cor" },
      { key: "net_weight_g", label: "Peso líquido do rolo/embalagem (g)", type: "number" },
      { key: "purchase_date", label: "Data da compra", type: "date" },
      { key: "location", label: "Localização" },
      { key: "notes", label: "Observações", type: "multiline" },
    ],
  },
  transactions: {
    title: "Lançamento financeiro",
    fields: [
      { key: "type", label: "Tipo", type: "select", options: O.txType, default: "despesa", required: true },
      { key: "scope", label: "Finanças", type: "select", default: "empresa", options: [{ value: "empresa", label: "Empresa" }, { value: "pessoal", label: "Pessoal dos sócios" }] },
      { key: "description", label: "Descrição", required: true },
      { key: "category", label: "Categoria", type: "ref", ref: { col: "categories", valueKey: "name" } },
      { key: "amount", label: "Valor", type: "money", required: true },
      { key: "due_date", label: "Vencimento / data", type: "date", required: true },
      { key: "paid_date", label: "Data do pagamento (vazio = pendente)", type: "date" },
      { key: "supplier_id", label: "Fornecedor", type: "ref", ref: { col: "suppliers" } },
      { key: "method", label: "Forma de pagamento" },
      { key: "notes", label: "Observações", type: "multiline" },
    ],
  },
  purchases: {
    title: "Item da lista de compras",
    fields: [
      { key: "name", label: "Material", required: true },
      { key: "material_id", label: "Item do estoque (atualiza ao receber)", type: "ref", ref: { col: "materials" } },
      { key: "qty", label: "Quantidade", type: "number", required: true },
      { key: "est_unit_price", label: "Preço estimado por unidade", type: "money" },
      { key: "supplier_id", label: "Fornecedor", type: "ref", ref: { col: "suppliers" } },
      { key: "lead_days", label: "Prazo de entrega", type: "number", suffix: "dias" },
      { key: "reason", label: "Motivo da compra" },
      { key: "priority", label: "Prioridade", type: "select", default: "media", options: [{ value: "alta", label: "Alta" }, { value: "media", label: "Média" }, { value: "baixa", label: "Baixa" }] },
      { key: "category", label: "Categoria da despesa", type: "ref", ref: { col: "categories", valueKey: "name" } },
    ],
  },
  printers: {
    title: "Impressora",
    fields: [
      { key: "name", label: "Nome", required: true },
      { key: "code", label: "Código", type: "select", options: [{ value: "a1", label: "A1" }, { value: "a1mini", label: "A1 Mini" }, { value: "outra", label: "Outra" }] },
      { key: "power_w", label: "Consumo médio", type: "number", suffix: "W" },
      { key: "kwh_cost", label: "Custo do kWh específico (opcional)", type: "money" },
      { key: "purchase_price", label: "Valor de compra", type: "money" },
      { key: "lifespan_hours", label: "Vida útil estimada", type: "number", suffix: "horas" },
      { key: "maintenance_pct", label: "Manutenção sobre depreciação", type: "number", suffix: "%" },
      { key: "initial_hours", label: "Horas já utilizadas antes do app", type: "number" },
      { key: "bed", label: "Área de impressão" },
      { key: "notes", label: "Observações", type: "multiline" },
    ],
  },
  categories: {
    title: "Categoria",
    fields: [
      { key: "name", label: "Nome", required: true },
      { key: "type", label: "Tipo", type: "select", default: "despesa", options: [{ value: "despesa", label: "Despesa" }, { value: "receita", label: "Receita" }] },
      { key: "in_result", label: "Entra no resultado como despesa operacional", type: "bool", default: true,
        hint: "Desligue se o custo já está no custo de produção (filamento, energia, parcelas da impressora, taxas) para não contar duas vezes" },
    ],
  },
  jobs: {
    title: "Trabalho de impressão",
    fields: [
      { key: "order_id", label: "Pedido vinculado", type: "ref", ref: { col: "orders", labelKey: "number" } },
      { key: "product_id", label: "Produto", type: "ref", ref: { col: "products" } },
      { key: "qty", label: "Quantidade", type: "number", required: true, default: 1 },
      { key: "printer_id", label: "Impressora (vazio = distribuir automaticamente)", type: "ref", ref: { col: "printers" } },
      { key: "material_id", label: "Filamento", type: "ref", ref: { col: "materials", filter: (x) => x.kind === "filamento" } },
      { key: "colors", label: "Cores utilizadas" },
      { key: "est_weight", label: "Peso previsto total", type: "number", suffix: "g" },
      { key: "est_minutes", label: "Tempo estimado total", type: "number", suffix: "min" },
      { key: "due_date", label: "Prazo", type: "date" },
      { key: "status", label: "Status", type: "select", default: "planejado", options: [{ value: "planejado", label: "Planejado" }, { value: "na_fila", label: "Na fila" }] },
      { key: "notes", label: "Observações", type: "multiline" },
    ],
  },
};
