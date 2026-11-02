import PDFDocument from "pdfkit";

export type AttendancePdfRow = {
  id: string;
  siteCode: string;
  siteName: string;
  employeeId: string;
  employeeName: string;
  entryTime: string;
  exitTime: string | null;
  status: "OPEN" | "CLOSED";
  safetyStatus: string;
  safetyDeclaration: { submittedAt: string } | null;
};

type AttendancePdfOptions = {
  siteLabel: string;
  dateRange: string;
  filters: string;
  timezone?: string;
};

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 36;
const FOOTER_HEIGHT = 30;
const BODY_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;
const NAVY = "#102A56";
const ORANGE = "#F28C28";
const TEXT = "#1E293B";
const MUTED = "#64748B";
const BORDER = "#D7E0EA";
const PALE_BLUE = "#F3F7FB";
const PALE_ORANGE = "#FFF7ED";

function statusLabel(value: string): string {
  if (value === "DECLARED") return "Declared";
  if (value === "NOT_RECORDED" || value === "MISSING") return "Not recorded";
  return value.toLowerCase().replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function timestamp(value: string | null, timezone: string): string {
  if (!value) return "Not checked out";
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}\n${get("hour")}:${get("minute")}`;
}

function duration(row: AttendancePdfRow): string {
  if (!row.exitTime) return "Not checked out";
  const seconds = Math.max(0, Math.round((new Date(row.exitTime).getTime() - new Date(row.entryTime).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const totalMinutes = Math.floor(seconds / 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function pdfText(value: string): string { return value.replace(/[\r\n]+/g, " ").trim(); }

export function buildAttendancePdf(rows: AttendancePdfRow[], options: AttendancePdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timezone = options.timezone || "UTC";
    const multipleSites = new Set(rows.map((row) => row.siteCode)).size > 1;
    const columns = multipleSites
      ? [{ key: "employee", label: "Employee / ID", width: 145 }, { key: "site", label: "Construction site", width: 150 }, { key: "entry", label: "Entry", width: 100 }, { key: "exit", label: "Exit", width: 100 }, { key: "duration", label: "Duration", width: 85 }, { key: "safety", label: "Safety", width: 110 }, { key: "status", label: "Status", width: 91 }]
      : [{ key: "employee", label: "Employee / ID", width: 190 }, { key: "entry", label: "Entry", width: 116 }, { key: "exit", label: "Exit", width: 116 }, { key: "duration", label: "Duration", width: 92 }, { key: "safety", label: "Safety", width: 130 }, { key: "status", label: "Status", width: 106 }];
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 0 }, autoFirstPage: true });
    const chunks: Buffer[] = [];
    let pageNumber = 1;
    let y = MARGIN;
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const drawFooter = () => {
      const dividerY = PAGE_HEIGHT - FOOTER_HEIGHT - 2;
      doc.save().strokeColor(BORDER).lineWidth(0.6).moveTo(MARGIN, dividerY).lineTo(PAGE_WIDTH - MARGIN, dividerY).stroke();
      doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(`SITEPASS  |  Employee attendance report  |  Times shown in ${timezone}`, MARGIN, dividerY + 9, { width: 500, lineBreak: false });
      doc.text(`Page ${pageNumber}`, PAGE_WIDTH - MARGIN - 70, dividerY + 9, { width: 70, align: "right", lineBreak: false }).restore();
    };
    const drawTableHeader = () => {
      const headerHeight = 30;
      doc.save().fillColor(NAVY).roundedRect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, headerHeight, 3).fill();
      let x = MARGIN;
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8.5);
      for (const column of columns) { doc.text(column.label, x + 7, y + 10, { width: column.width - 14, lineBreak: false }); x += column.width; }
      doc.restore();
      y += headerHeight;
    };
    const newPage = () => { drawFooter(); doc.addPage({ size: "A4", layout: "landscape", margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 0 } }); pageNumber += 1; y = MARGIN; drawCompactHeader(); drawTableHeader(); };
    const drawCompactHeader = () => { doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text("SITEPASS", MARGIN, y, { lineBreak: false }); doc.fillColor(ORANGE).rect(MARGIN + 53, y + 8, 26, 2).fill(); doc.fillColor(MUTED).font("Helvetica").fontSize(9).text("Employee Attendance Report", MARGIN + 92, y + 1, { lineBreak: false }); y += 25; };

    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(22).text("SITEPASS", MARGIN, y, { lineBreak: false });
    doc.fillColor(ORANGE).rect(MARGIN, y + 29, 72, 3).fill();
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(17).text("Employee Attendance Report", MARGIN, y + 43, { lineBreak: false });
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(`Generated ${timestamp(new Date().toISOString(), timezone).replace("\n", " ")} (${timezone})`, MARGIN, y + 70, { lineBreak: false });
    doc.text(`Reporting period: ${options.dateRange}`, MARGIN, y + 84, { lineBreak: false });
    doc.text(`Site: ${options.siteLabel}`, MARGIN, y + 98, { lineBreak: false });
    doc.text(`Filters: ${options.filters}`, MARGIN, y + 112, { width: PAGE_WIDTH - MARGIN * 2, lineBreak: false, ellipsis: true });
    y += 138;

    const open = rows.filter((row) => row.status === "OPEN").length;
    const cardWidth = (PAGE_WIDTH - MARGIN * 2 - 16) / 3;
    [{ label: "Total attendance records", value: rows.length, color: NAVY }, { label: "Open sessions", value: open, color: "#0F766E" }, { label: "Closed sessions", value: rows.length - open, color: ORANGE }].forEach((card, index) => { const x = MARGIN + index * (cardWidth + 8); doc.save().fillColor(index === 2 ? PALE_ORANGE : PALE_BLUE).roundedRect(x, y, cardWidth, 47, 5).fill(); doc.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(card.label, x + 12, y + 10, { lineBreak: false }); doc.fillColor(card.color).font("Helvetica-Bold").fontSize(16).text(String(card.value), x + 12, y + 24, { lineBreak: false }).restore(); });
    y += 65;
    drawTableHeader();

    rows.forEach((row, index) => {
      const values = multipleSites
        ? [`${row.employeeName}\n${row.employeeId}`, `${row.siteName}\n${row.siteCode}`, timestamp(row.entryTime, timezone), timestamp(row.exitTime, timezone), duration(row), statusLabel(row.safetyStatus), row.status === "OPEN" ? "Open" : "Closed"]
        : [`${row.employeeName}\n${row.employeeId}`, timestamp(row.entryTime, timezone), timestamp(row.exitTime, timezone), duration(row), statusLabel(row.safetyStatus), row.status === "OPEN" ? "Open" : "Closed"];
      doc.font("Helvetica").fontSize(9);
      const padding = 14;
      const rowHeight = Math.max(34, ...values.map((value, cellIndex) => doc.heightOfString(value, { width: columns[cellIndex].width - padding, lineGap: 1 }))) + padding;
      if (y + rowHeight > BODY_BOTTOM) newPage();
      if (index % 2 === 0) doc.save().fillColor("#FAFCFE").rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, rowHeight).fill().restore();
      let x = MARGIN;
      values.forEach((value, cellIndex) => { const isStatus = columns[cellIndex].key === "status"; const isSafety = columns[cellIndex].key === "safety"; doc.fillColor(isStatus ? (row.status === "OPEN" ? "#0F766E" : NAVY) : isSafety && row.safetyStatus === "DECLARED" ? "#166534" : TEXT).font(isStatus || isSafety ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(value, x + 7, y + 7, { width: columns[cellIndex].width - padding, height: rowHeight - padding, lineGap: 1 }); x += columns[cellIndex].width; });
      doc.save().strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN, y + rowHeight).lineTo(PAGE_WIDTH - MARGIN, y + rowHeight).stroke().restore();
      y += rowHeight;
    });
    drawFooter();
    doc.end();
  });
}
