import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { brl, fdate } from "@/src/format";

export async function exportCSV(name: string, rows: Record<string, any>[]) {
  if (!rows.length) throw new Error("Sem dados para exportar");
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\n");
  const filename = `${name}.csv`;
  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = (globalThis as any).document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    return;
  }
  const f = new File(Paths.cache, filename);
  if (f.exists) f.delete();
  f.create();
  f.write(csv);
  await Sharing.shareAsync(f.uri, { mimeType: "text/csv", dialogTitle: filename });
}

export async function exportPDF(html: string) {
  if (Platform.OS === "web") return Print.printAsync({ html });
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
}

export const copyText = (t: string) => Clipboard.setStringAsync(t);

const CSS = `body{font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;padding:28px}h1{margin:0;font-size:22px}
.logo{display:inline-block;background:#E5A93B;color:#121212;font-weight:900;padding:10px 14px;border-radius:10px;font-size:18px;letter-spacing:1px}
.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #E5A93B;padding-bottom:14px;margin-bottom:18px}
table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:13px}
th{background:#f4efe4}.r{text-align:right}.tot{font-size:16px;font-weight:bold}.muted{color:#666;font-size:12px}`;

export function quoteHTML(q: any, s: any) {
  const rows = (q.items || []).map((i: any) => `<tr><td><b>${i.name}</b>${i.customization ? `<br/><span class="muted">${i.customization}</span>` : ""}</td>
    <td class="r">${i.qty}</td><td class="r">${brl(i.unit_price)}</td><td class="r">${brl(i.qty * i.unit_price)}</td></tr>`).join("");
  return `<html><head><meta charset="utf-8"/><style>${CSS}</style></head><body>
  <div class="head"><div><span class="logo">VBM 3D</span></div><div style="text-align:right"><h1>Orçamento ${q.number}</h1>
  <div class="muted">Emitido em ${fdate(q.quote_date)} · Válido até ${fdate(q.valid_until)}</div></div></div>
  <p><b>Cliente:</b> ${q.client_name || "—"}</p>
  <table><tr><th>Produto</th><th class="r">Qtd.</th><th class="r">Valor un.</th><th class="r">Total</th></tr>${rows}</table>
  <table>${q.discount ? `<tr><td>Desconto</td><td class="r">- ${brl(q.discount)}</td></tr>` : ""}
  <tr><td class="tot">Total</td><td class="r tot">${brl(q.total)}</td></tr>
  ${q.deposit ? `<tr><td>Sinal</td><td class="r">${brl(q.deposit)}</td></tr><tr><td>Saldo restante</td><td class="r">${brl(q.balance)}</td></tr>` : ""}</table>
  <p><b>Prazo estimado de produção:</b> ${q.production_days || "—"} dia(s) úteis após aprovação</p>
  <p><b>Condições de pagamento:</b> ${q.payment_terms || "A combinar"}</p>
  ${q.notes ? `<p><b>Observações:</b> ${q.notes}</p>` : ""}
  <p class="muted">${s?.company_name || "VBM 3D"} ${s?.company_phone ? "· " + s.company_phone : ""} ${s?.company_instagram ? "· " + s.company_instagram : ""}</p>
  </body></html>`;
}

export function quoteText(q: any, s: any) {
  const items = (q.items || []).map((i: any) => `• ${i.qty}x ${i.name}${i.customization ? ` (${i.customization})` : ""} — ${brl(i.unit_price)} un. = ${brl(i.qty * i.unit_price)}`).join("\n");
  return `*${s?.company_name || "VBM 3D"} — Orçamento ${q.number}*\n\nOlá${q.client_name ? `, ${q.client_name}` : ""}! Segue seu orçamento:\n\n${items}\n\n${q.discount ? `Desconto: ${brl(q.discount)}\n` : ""}*Total: ${brl(q.total)}*\n${q.deposit ? `Sinal: ${brl(q.deposit)} · Saldo: ${brl(q.balance)}\n` : ""}\nPrazo de produção: ${q.production_days || "—"} dia(s)\nPagamento: ${q.payment_terms || "a combinar"}\nVálido até ${fdate(q.valid_until)}`;
}

export function tableHTML(title: string, sections: { title: string; rows: Record<string, any>[] }[]) {
  const body = sections.map((sec) => {
    if (!sec.rows.length) return `<h3>${sec.title}</h3><p class="muted">Sem dados</p>`;
    const cols = Object.keys(sec.rows[0]);
    return `<h3>${sec.title}</h3><table><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>${sec.rows.map((r) => `<tr>${cols.map((c) => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</table>`;
  }).join("");
  return `<html><head><meta charset="utf-8"/><style>${CSS}</style></head><body><div class="head"><span class="logo">VBM 3D</span><h1>${title}</h1></div>${body}</body></html>`;
}
