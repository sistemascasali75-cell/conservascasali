// Helpers de exportación cliente (PDF + XLSX)
// Dynamic imports: jspdf/exceljs solo se descargan al exportar.

type Cell = string | number | null | undefined;

const fmt = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const fmt0 = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 0 });

function toNum(c: Cell): number | null {
  if (typeof c === "number" && Number.isFinite(c)) return c;
  if (typeof c === "string") {
    const cleaned = c.replace(/[\s,]/g, "").replace(/(\d)\.(?=\d{3}(\D|$))/g, "$1");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Totales por columna (numérica). */
function computeColumnTotals(headers: string[], rows: Cell[][]): { label: string; total: number }[] {
  const totals: { label: string; total: number; hasNum: boolean }[] = headers.map((h) => ({ label: h, total: 0, hasNum: false }));
  for (const row of rows) {
    row.forEach((c, i) => {
      if (i >= totals.length) return;
      const n = toNum(c);
      if (n !== null) { totals[i].total += n; totals[i].hasNum = true; }
    });
  }
  return totals.filter((t) => t.hasNum).map((t) => ({ label: t.label, total: t.total }));
}

/** Detecta columnas Cajas / Latas / Empaque y calcula Inventario total en latas. */
function computeInventarioLatas(headers: string[], rows: Cell[][]): { totalCajas: number; totalLatas: number; totalInventario: number } | null {
  const idx = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const iCajas = idx(/cajas/i);
  const iLatas = idx(/^latas$|^latas\b/i);
  const iEmp = idx(/empaque/i);
  if (iCajas < 0 && iLatas < 0) return null;
  let totalCajas = 0, totalLatas = 0, totalInventario = 0;
  for (const row of rows) {
    const cajas = iCajas >= 0 ? toNum(row[iCajas]) ?? 0 : 0;
    const latas = iLatas >= 0 ? toNum(row[iLatas]) ?? 0 : 0;
    const emp = iEmp >= 0 ? toNum(row[iEmp]) ?? 48 : 48;
    totalCajas += cajas;
    totalLatas += latas;
    totalInventario += cajas * emp + latas;
  }
  return { totalCajas, totalLatas, totalInventario };
}

export async function exportPDF(opts: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  filename: string;
  summary?: { label: string; value: string | number }[];
  /** Secciones adicionales (ej. detalle de todos los registros filtrados). */
  sections?: { title: string; headers: string[]; rows: (string | number | null | undefined)[][] }[];
  /** Cuando esté presente, sobrescribe el cálculo automático de inventario. */
  inventario?: { cajas: number; latas: number; totalLatas: number };
}) {

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(14);
  doc.text(opts.title, 14, 14);
  let cursorY = 20;
  if (opts.subtitle) {
    doc.setFontSize(9); doc.setTextColor(120);
    const lines = doc.splitTextToSize(opts.subtitle, pageW - 28) as string[];
    doc.text(lines, 14, cursorY);
    doc.setTextColor(0);
    cursorY += lines.length * 4.5 + 2;
  }

  // Banner "INVENTARIO TOTAL · LATAS"
  const inv = opts.inventario
    ?? (() => {
      const c = computeInventarioLatas(opts.headers, opts.rows);
      return c ? { cajas: c.totalCajas, latas: c.totalLatas, totalLatas: c.totalInventario } : null;
    })();

  if (inv && (inv.cajas > 0 || inv.latas > 0)) {
    doc.setFillColor(30, 58, 95);
    doc.rect(14, cursorY, pageW - 28, 16, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text("INVENTARIO TOTAL", 18, cursorY + 6);
    doc.setFontSize(16); doc.setFont(undefined as any, "bold");
    doc.text(`${fmt0(inv.totalLatas)} LATAS`, 18, cursorY + 13);
    doc.setFont(undefined as any, "normal");
    doc.setFontSize(9);
    doc.text(`(${fmt0(inv.cajas)} cajas + ${fmt0(inv.latas)} latas sueltas)`, pageW - 18, cursorY + 13, { align: "right" });
    doc.setTextColor(0);
    cursorY += 20;
  }

  // Totales por columna
  const totals = opts.summary
    ? opts.summary.map((s) => ({ label: s.label, total: s.value }))
    : computeColumnTotals(opts.headers, opts.rows).map((t) => ({ label: t.label, total: fmt(t.total) }));

  if (totals.length > 0) {
    doc.setFontSize(9);
    doc.setFillColor(240, 245, 250);
    doc.rect(14, cursorY, pageW - 28, 11, "F");
    doc.setFont(undefined as any, "bold"); doc.setTextColor(30, 58, 95);
    doc.text("RESUMEN · TOTALES POR COLUMNA", 16, cursorY + 4);
    doc.setFont(undefined as any, "normal"); doc.setTextColor(40);
    const line = totals.map((t) => `${t.label}: ${t.total}`).join("   |   ");
    doc.text(line, 16, cursorY + 9);
    doc.setTextColor(0);
    cursorY += 14;
  }

  autoTable(doc, {
    head: [opts.headers],
    body: opts.rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c)))),
    startY: cursorY,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95] },
  });

  for (const sec of opts.sections ?? []) {
    const prevY = (doc as any).lastAutoTable?.finalY ?? cursorY;
    doc.addPage("a4", "landscape");
    doc.setFontSize(11); doc.setTextColor(30, 58, 95);
    doc.text(sec.title, 14, 14);
    doc.setTextColor(0);
    void prevY;
    autoTable(doc, {
      head: [sec.headers],
      body: sec.rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c)))),
      startY: 18,
      styles: { fontSize: 6.5, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [30, 58, 95], fontSize: 6.5 },
    });
  }

  doc.save(opts.filename);
}


export async function exportXLSX(opts: {
  sheetName: string;
  headers: string[];
  rows: (string | number | null)[][];
  filename: string;
  summary?: { label: string; value: string | number }[];
  inventario?: { cajas: number; latas: number; totalLatas: number };
}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName);

  const inv = opts.inventario
    ?? (() => {
      const c = computeInventarioLatas(opts.headers, opts.rows);
      return c ? { cajas: c.totalCajas, latas: c.totalLatas, totalLatas: c.totalInventario } : null;
    })();

  const cols = Math.max(opts.headers.length, 3);

  if (inv && (inv.cajas > 0 || inv.latas > 0)) {
    const r1 = ws.addRow(["INVENTARIO TOTAL (LATAS)"]);
    r1.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    r1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    ws.mergeCells(r1.number, 1, r1.number, cols);
    const r2 = ws.addRow([`${fmt0(inv.totalLatas)} latas  ·  (${fmt0(inv.cajas)} cajas + ${fmt0(inv.latas)} latas sueltas)`]);
    r2.font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
    ws.mergeCells(r2.number, 1, r2.number, cols);
    ws.addRow([]);
  }

  const totals = opts.summary
    ? opts.summary.map((s) => ({ label: s.label, total: s.value as string | number }))
    : computeColumnTotals(opts.headers, opts.rows).map((t) => ({ label: t.label, total: t.total }));

  if (totals.length > 0) {
    const headerRow = ws.addRow(["RESUMEN · TOTALES"]);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    ws.mergeCells(headerRow.number, 1, headerRow.number, cols);
    totals.forEach((t) => {
      const r = ws.addRow([t.label, t.total]);
      r.getCell(1).font = { bold: true };
    });
    ws.addRow([]);
  }

  const head = ws.addRow(opts.headers);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  opts.rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c) => {
    let max = 10;
    c.eachCell?.((cell) => {
      const v = cell.value ? String(cell.value).length : 0;
      if (v > max) max = v;
    });
    c.width = Math.min(max + 2, 50);
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = opts.filename; a.click();
  URL.revokeObjectURL(url);
}
