import PDFDocument from "pdfkit";

export type VisitorReportRow = {
  fullName: string;
  visitorCode: string | null;
  email: string | null;
  phone: string | null;
  purpose: string | null;
  siteName: string;
  siteCode: string;
  entryTime: string | null;
  exitTime: string | null;
  visitStatus: "REGISTERED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";
  safetyStatus: string;
};

type VisitorPdfOptions = { dateRange: string; siteLabel: string; filters: string; timezone?: string };
const PAGE_WIDTH = 841.89; const PAGE_HEIGHT = 595.28; const MARGIN = 36; const FOOTER_HEIGHT = 30; const BODY_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;
const NAVY = "#102A56"; const ORANGE = "#F28C28"; const TEXT = "#1E293B"; const MUTED = "#64748B"; const BORDER = "#D7E0EA";

function label(value: string): string { return value === "REGISTERED" ? "Registered" : value === "CHECKED_IN" ? "Checked In" : value === "CHECKED_OUT" ? "Checked Out" : value === "CANCELLED" ? "Cancelled" : "Not recorded"; }
function safety(value: string): string { return value === "COMPLETED" ? "Completed" : value === "PENDING" ? "Pending" : "Not recorded"; }
function time(value: string | null, timezone: string, empty: string): string { if (!value) return empty; const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value)); const get = (type: string) => parts.find((part) => part.type === type)?.value || ""; return `${get("year")}-${get("month")}-${get("day")}\n${get("hour")}:${get("minute")}`; }

export function buildVisitorPdf(rows: VisitorReportRow[], options: VisitorPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timezone = options.timezone || "UTC"; const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 0 } }); const chunks: Buffer[] = []; let page = 1; let y = MARGIN;
    const columns = [{ label: "Visitor / ID", width: 125 }, { label: "Email / phone", width: 145 }, { label: "Construction site", width: 125 }, { label: "Reason for visit", width: 150 }, { label: "Entry", width: 82 }, { label: "Exit", width: 82 }, { label: "Status / safety", width: 76 }];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    const footer = () => { const line = PAGE_HEIGHT - FOOTER_HEIGHT - 2; doc.save().strokeColor(BORDER).lineWidth(0.6).moveTo(MARGIN, line).lineTo(PAGE_WIDTH - MARGIN, line).stroke(); doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(`SITEPASS  |  Visitor report  |  Times shown in ${timezone}`, MARGIN, line + 9, { width: 500, lineBreak: false }); doc.text(`Page ${page}`, PAGE_WIDTH - MARGIN - 70, line + 9, { width: 70, align: "right", lineBreak: false }).restore(); };
    const tableHeader = () => { const height = 30; doc.save().fillColor(NAVY).roundedRect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, height, 3).fill(); let x = MARGIN; doc.fillColor("white").font("Helvetica-Bold").fontSize(8.5); for (const column of columns) { doc.text(column.label, x + 7, y + 10, { width: column.width - 14, lineBreak: false }); x += column.width; } doc.restore(); y += height; };
    const compactHeader = () => { doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text("SITEPASS", MARGIN, y, { lineBreak: false }); doc.fillColor(ORANGE).rect(MARGIN + 53, y + 8, 26, 2).fill(); doc.fillColor(MUTED).font("Helvetica").fontSize(9).text("Visitor Entry and Exit Report", MARGIN + 92, y + 1, { lineBreak: false }); y += 25; };
    const nextPage = () => { footer(); doc.addPage({ size: "A4", layout: "landscape", margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 0 } }); page += 1; y = MARGIN; compactHeader(); tableHeader(); };
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(22).text("SITEPASS", MARGIN, y, { lineBreak: false }); doc.fillColor(ORANGE).rect(MARGIN, y + 29, 72, 3).fill(); doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(17).text("Visitor Entry and Exit Report", MARGIN, y + 43, { lineBreak: false }); doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(`Generated ${new Date().toISOString().replace("T", " ").replace(".000Z", " UTC")}  |  Reporting timezone: ${timezone}`, MARGIN, y + 70, { lineBreak: false }); doc.text(`Reporting period: ${options.dateRange}`, MARGIN, y + 84, { lineBreak: false }); doc.text(`Site: ${options.siteLabel}`, MARGIN, y + 98, { lineBreak: false }); doc.text(`Filters: ${options.filters}`, MARGIN, y + 112, { width: PAGE_WIDTH - MARGIN * 2, lineBreak: false, ellipsis: true }); y += 138;
    const cardWidth = (PAGE_WIDTH - MARGIN * 2 - 16) / 3; const counts = [{ label: "Total visitors", value: rows.length, color: NAVY }, { label: "Checked in", value: rows.filter((row) => row.visitStatus === "CHECKED_IN").length, color: "#0F766E" }, { label: "Checked out", value: rows.filter((row) => row.visitStatus === "CHECKED_OUT").length, color: ORANGE }]; counts.forEach((card, index) => { const x = MARGIN + index * (cardWidth + 8); doc.save().fillColor(index === 2 ? "#FFF7ED" : "#F3F7FB").roundedRect(x, y, cardWidth, 47, 5).fill(); doc.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(card.label, x + 12, y + 10, { lineBreak: false }); doc.fillColor(card.color).font("Helvetica-Bold").fontSize(16).text(String(card.value), x + 12, y + 24, { lineBreak: false }).restore(); }); y += 65; tableHeader();
    rows.forEach((row, index) => { const values = [`${row.fullName}\n${row.visitorCode || "Visitor ID not recorded"}`, `${row.email || "Email not provided"}\n${row.phone || "Phone not provided"}`, `${row.siteName}\n${row.siteCode}`, row.purpose || "Not provided", time(row.entryTime, timezone, "Not checked in"), time(row.exitTime, timezone, "Not checked out"), `${label(row.visitStatus)}\nSafety: ${safety(row.safetyStatus)}`]; doc.font("Helvetica").fontSize(9); const rowHeight = Math.max(38, ...values.map((value, cell) => doc.heightOfString(value, { width: columns[cell].width - 14, lineGap: 1 }))) + 14; if (y + rowHeight > BODY_BOTTOM) nextPage(); if (index % 2 === 0) doc.save().fillColor("#FAFCFE").rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, rowHeight).fill().restore(); let x = MARGIN; values.forEach((value, cell) => { const statusCell = cell === 6; doc.fillColor(statusCell ? (row.visitStatus === "CHECKED_IN" ? "#0F766E" : row.visitStatus === "CANCELLED" ? "#B45309" : NAVY) : TEXT).font(statusCell ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(value, x + 7, y + 7, { width: columns[cell].width - 14, height: rowHeight - 14, lineGap: 1 }); x += columns[cell].width; }); doc.save().strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN, y + rowHeight).lineTo(PAGE_WIDTH - MARGIN, y + rowHeight).stroke().restore(); y += rowHeight; }); footer(); doc.end();
  });
}
