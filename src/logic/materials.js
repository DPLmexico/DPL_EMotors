/**
 * Lista de materiales: consolidación, JSON para el cotizador y PDF.
 *
 * Una entrada de la lista (`entry`) es un motor agregado por el usuario:
 *   { id, label, brand, chart, motor, starterLabel, coilLabel, extras: [labels], count, items: [{ part, description, unit, qty, note, category }] }
 * `items[].qty` es por motor; la cantidad total se multiplica por `count`.
 */

export const CLIPBOARD_TYPE = "cotsreact-children-v1";

export function motorSummary(e) {
  return `${e.motor.hp} HP · ${e.motor.kw} kW · ${e.motor.amps} A`;
}

/** Suma cantidades de todos los motores agrupando por marca + número de catálogo. */
export function consolidate(entries) {
  const map = new Map();
  for (const e of entries) {
    for (const it of e.items) {
      const key = `${e.brand}|${it.part}`;
      const prev = map.get(key);
      if (prev) prev.qty += it.qty * e.count;
      else map.set(key, { ...it, brand: e.brand, qty: it.qty * e.count });
    }
  }
  return [...map.values()];
}

export function buildClipboardPayload(entries, proveedor) {
  return {
    type: CLIPBOARD_TYPE,
    copiedAt: new Date().toISOString(),
    children: consolidate(entries).map((it) => ({
      tipoconcepto: "MATERIAL",
      grupo: "",
      proveedor,
      nocatalogo: it.part,
      descripcion: it.description,
      unidad: it.unit,
      cantidad: it.qty,
      precio: 0,
      valor: 0,
    })),
  };
}

export async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Respaldo para http:// o navegadores sin Clipboard API
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("No se pudo copiar al portapapeles");
}

// ─── CSV ────────────────────────────────────────────────────────────────────
// Solo datos, sin marca: pensado para abrirse directo en Excel (BOM UTF-8 para acentos,
// separador coma y fin de línea CRLF).

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCSV(name, header, rows) {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + text + "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Lista de compra: una fila por número de catálogo. */
export function exportCSV(entries) {
  if (!entries.length) return;
  downloadCSV(
    "lista_materiales_motores",
    ["Partida", "Marca", "No. catálogo", "Descripción", "Unidad", "Cantidad"],
    consolidate(entries).map((it, i) => [i + 1, it.brand.toUpperCase(), it.part, it.description, it.unit, it.qty]),
  );
}

/** Una fila por componente de cada motor, para filtrar o hacer tablas dinámicas. */
export function exportCSVDetail(entries) {
  if (!entries.length) return;
  const rows = entries.flatMap((e, idx) =>
    e.items.map((it) => [
      idx + 1,
      e.label,
      e.brandName,
      e.chartLabel,
      e.motor.hp,
      e.motor.kw,
      e.motor.amps,
      e.starterLabel,
      e.coilLabel ?? "",
      e.extras.join(" + "),
      e.count,
      it.category,
      it.part,
      it.description,
      it.unit,
      it.qty,
      it.qty * e.count,
      it.note ?? "",
    ]),
  );
  downloadCSV(
    "detalle_motores",
    [
      "Motor", "Identificador", "Marca", "Tabla", "HP", "kW", "A", "Arranque", "Control (bobina)",
      "Extras", "Motores iguales", "Componente", "No. catálogo", "Descripción", "Unidad",
      "Cant. por motor", "Cant. total", "Nota",
    ],
    rows,
  );
}

// ─── PDF ────────────────────────────────────────────────────────────────────

const GREEN = [0, 184, 95];
const PAGE_W = 216;
const PAGE_BOTTOM = 262;
const MARGIN = 12;

export async function exportPDF(entries, proveedor) {
  if (!entries.length) return;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const generated = new Date().toLocaleString("es-MX");

  const drawHeader = () => {
    doc.setFillColor(5, 5, 5);
    doc.rect(0, 0, PAGE_W, 26, "F");
    doc.setTextColor(0, 232, 122);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("DPL México — Lista de Materiales para Motores", MARGIN, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(170, 170, 170);
    doc.text(`Generado: ${generated}${proveedor ? `   ·   Proveedor: ${proveedor}` : ""}`, MARGIN, 20);
  };

  let y = 0;
  const newPage = () => {
    doc.addPage();
    drawHeader();
    y = 34;
  };
  const ensure = (h) => {
    if (y + h > PAGE_BOTTOM) newPage();
  };
  const sectionTitle = (text) => {
    ensure(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...GREEN);
    doc.text(text.toUpperCase(), MARGIN, y);
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
    y += 7;
  };

  // Tabla genérica: columnas { title, width, align?, get }
  const table = (cols, rows) => {
    const rowLines = (r) =>
      cols.map((c) => doc.splitTextToSize(String(c.get(r)), c.width - 3));
    const head = () => {
      doc.setFillColor(23, 27, 24);
      doc.rect(MARGIN, y - 4, PAGE_W - 2 * MARGIN, 6.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      let x = MARGIN + 1.5;
      for (const c of cols) {
        doc.text(c.title, c.align === "right" ? x + c.width - 3 : x, y, { align: c.align || "left" });
        x += c.width;
      }
      y += 6;
    };
    ensure(14);
    head();
    rows.forEach((r, idx) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const lines = rowLines(r);
      const h = Math.max(...lines.map((l) => l.length)) * 3.6 + 2.4;
      if (y + h > PAGE_BOTTOM) {
        newPage();
        head();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
      }
      if (idx % 2 === 0) {
        doc.setFillColor(242, 245, 243);
        doc.rect(MARGIN, y - 3.8, PAGE_W - 2 * MARGIN, h, "F");
      }
      doc.setTextColor(30, 30, 30);
      let x = MARGIN + 1.5;
      cols.forEach((c, i) => {
        doc.text(lines[i], c.align === "right" ? x + c.width - 3 : x, y, { align: c.align || "left" });
        x += c.width;
      });
      y += h;
    });
    y += 4;
  };

  drawHeader();
  y = 36;

  // 1) Lista consolidada
  const total = consolidate(entries);
  sectionTitle(`Lista de materiales consolidada (${total.length} partidas)`);
  table(
    [
      { title: "#", width: 10, get: (r) => r.n },
      { title: "No. catálogo", width: 34, get: (r) => r.part },
      { title: "Descripción", width: 116, get: (r) => r.description },
      { title: "Unidad", width: 16, get: (r) => r.unit },
      { title: "Cant.", width: 16, align: "right", get: (r) => r.qty },
    ],
    total.map((r, i) => ({ ...r, n: i + 1 })),
  );

  // 2) Detalle por motor
  sectionTitle(`Detalle por motor (${entries.length})`);
  const notes = [];
  entries.forEach((e, idx) => {
    ensure(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    const title = `#${String(idx + 1).padStart(2, "0")}  ${e.label || "Motor"}${e.count > 1 ? `  (×${e.count})` : ""}`;
    doc.text(title, MARGIN, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    const meta = [
      `${e.brandName} · ${e.chartLabel} · ${motorSummary(e)}`,
      `Arranque: ${e.starterLabel}${e.coilLabel ? ` · Control ${e.coilLabel}` : ""}${e.extras.length ? ` · ${e.extras.join(", ")}` : ""}`,
    ];
    doc.text(meta, MARGIN, y);
    y += meta.length * 4 + 3;
    table(
      [
        { title: "Componente", width: 40, get: (r) => r.category },
        { title: "No. catálogo", width: 34, get: (r) => r.part + (r.noteRef ? ` (${r.noteRef})` : "") },
        { title: "Descripción", width: 94, get: (r) => r.description },
        { title: "Cant./motor", width: 24, align: "right", get: (r) => r.qty },
      ],
      e.items.map((it) => {
        if (!it.note) return it;
        notes.push(it.note);
        return { ...it, noteRef: `nota ${notes.length}` };
      }),
    );
  });

  // 3) Notas y aviso
  if (notes.length) {
    sectionTitle("Notas");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    notes.forEach((n, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${n}`, PAGE_W - 2 * MARGIN);
      ensure(lines.length * 3.8 + 1);
      doc.text(lines, MARGIN, y);
      y += lines.length * 3.8 + 1;
    });
    y += 3;
  }
  const disclaimer = doc.splitTextToSize(
    "Selección basada en las tablas del fabricante para motores de 60 Hz con corrientes nominales típicas. " +
      "Verifique contra los datos de placa del motor y la " +
      "normativa vigente (NOM-001-SEDE) antes de comprar o instalar.",
    PAGE_W - 2 * MARGIN,
  );
  ensure(disclaimer.length * 3.6 + 2);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(disclaimer, MARGIN, y);

  // Numeración de páginas
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`dplmexico.com   ·   Página ${p} de ${pages}`, PAGE_W - MARGIN, 272, { align: "right" });
  }

  doc.save(`dpl_lista_materiales_motores_${Date.now()}.pdf`);
}
