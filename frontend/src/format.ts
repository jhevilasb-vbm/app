export function brl(v: any) {
  const n = Number(v || 0);
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
}
export function fnum(v: any, dec = 0) {
  const n = Number(v || 0);
  return n.toFixed(dec).replace(".", ",");
}
export function fdate(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
export function fdatetime(s?: string | null) {
  if (!s) return "—";
  const dt = new Date(s);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}
export function parseNum(s: any): number | null {
  if (s === null || s === undefined || s === "") return null;
  if (typeof s === "number") return s;
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
export const toStr = (v: any) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
export function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(s: string, n: number) {
  const d = new Date(s + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export function minutesLabel(m: any) {
  const n = Math.round(Number(m || 0));
  const h = Math.floor(n / 60);
  return h ? `${h}h${String(n % 60).padStart(2, "0")}` : `${n}min`;
}

export function periodRange(key: string): { start: string; end: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const fmt = (x: Date) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  const y = d.getFullYear();
  const m = d.getMonth();
  if (key === "last") return { start: fmt(new Date(y, m - 1, 1)), end: fmt(new Date(y, m, 0)) };
  if (key === "3m") return { start: fmt(new Date(y, m - 2, 1)), end: fmt(new Date(y, m + 1, 0)) };
  if (key === "year") return { start: `${y}-01-01`, end: `${y}-12-31` };
  return { start: fmt(new Date(y, m, 1)), end: fmt(new Date(y, m + 1, 0)) };
}
export const PERIODS = [
  { value: "month", label: "Este mês" },
  { value: "last", label: "Mês anterior" },
  { value: "3m", label: "3 meses" },
  { value: "year", label: "Ano" },
];

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));
export const ORDER_STATUS: Record<string, string> = {
  confirmado: "Confirmado", em_producao: "Em produção", pronto: "Pronto p/ envio", entregue: "Entregue", cancelado: "Cancelado",
};
export const QUOTE_STATUS: Record<string, string> = {
  rascunho: "Em elaboração", enviado: "Enviado", aguardando: "Aguardando resposta", aprovado: "Aprovado", recusado: "Recusado",
};
export const CLIENT_STAGE: Record<string, string> = {
  novo_contato: "Novo contato", aguardando_info: "Aguardando informações", orcamento_elaboracao: "Orçamento em elaboração",
  orcamento_enviado: "Orçamento enviado", aguardando_resposta: "Aguardando resposta", aprovado: "Aprovado", recusado: "Recusado",
  pedido_em_producao: "Pedido em produção", pronto_entrega: "Pronto para entrega", entregue: "Entregue e finalizado",
};
export const JOB_STATUS: Record<string, string> = {
  planejado: "Planejado", na_fila: "Na fila", imprimindo: "Imprimindo", concluido: "Concluído", falhou: "Falhou", cancelado: "Cancelado",
};
export const PURCHASE_STATUS: Record<string, string> = {
  planejado: "Planejado", aprovado: "Aprovado", comprado: "Comprado", recebido: "Recebido",
};
export const CHANNELS: Record<string, string> = {
  shopee: "Shopee", instagram: "Instagram", whatsapp: "WhatsApp", direta: "Venda direta", outros: "Outros",
};
export const MATERIAL_KIND: Record<string, string> = {
  filamento: "Filamento", consumivel: "Consumível", embalagem: "Embalagem", ferramenta: "Ferramenta/durável", acabado: "Produto acabado", processo: "Em processo",
};
export const TX_TYPE: Record<string, string> = { despesa: "Despesa", receita: "Receita", aporte: "Aporte de sócio", retirada: "Retirada de sócio" };
export const TX_STATUS: Record<string, string> = { pago: "Pago", pendente: "Pendente", vencido: "Vencido" };
export const PAY_STATUS: Record<string, string> = { pago: "Pago", parcial: "Parcial", pendente: "A receber" };

export const O = {
  order: opts(ORDER_STATUS), quote: opts(QUOTE_STATUS), stage: opts(CLIENT_STAGE), job: opts(JOB_STATUS),
  purchase: opts(PURCHASE_STATUS), channel: opts(CHANNELS), kind: opts(MATERIAL_KIND), txType: opts(TX_TYPE),
};

export function tone(status: string): "success" | "warning" | "error" | "info" | "brand" {
  if (["pago", "entregue", "concluido", "aprovado", "recebido", "pronto"].includes(status)) return "success";
  if (["vencido", "falhou", "recusado", "cancelado", "atrasado"].includes(status)) return "error";
  if (["pendente", "parcial", "aguardando", "enviado", "na_fila", "comprado"].includes(status)) return "warning";
  if (["imprimindo", "em_producao"].includes(status)) return "brand";
  return "info";
}
