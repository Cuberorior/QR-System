import PDFDocument from "pdfkit";

export type AttendanceReportRow = {
  id: string; siteCode: string; siteName: string; employeeId: string; employeeName: string;
  entryTime: string; exitTime: string | null; status: "OPEN" | "CLOSED"; durationMinutes: number | null;
  safetyStatus: string; safetyDeclaration: { checklistVersion: string; submittedAt: string } | null;
};

const columns = [
  { label: "Employee", width: 112 }, { label: "Construction site", width: 120 }, { label: "Entry (UTC)", width: 92 },
  { label: "Exit (UTC)", width: 92 }, { label: "Duration", width: 48 }, { label: "Safety", width: 58 },
  { label: "Status", width: 55 }, { label: "Record ID", width: 109 },
] as const;

function csvValue(value: unknown): string {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildAttendanceCsv(rows: AttendanceReportRow[]): string {
  const headers = ["Attendance record ID", "Employee full name", "Employee ID/code", "Construction site name", "Construction site code", "Entry date", "Entry time", "Exit date", "Exit time", "Attendance status", "Total attendance duration (minutes)", "Safety verification status", "Safety declaration submitted at", "Safety checklist version"];
  const values = rows.map((row) => {
    const exit = row.exitTime ? new Date(row.exitTime) : null;
    return [row.id, row.employeeName, row.employeeId, row.siteName, row.siteCode, row.entryTime.slice(0, 10), row.entryTime, exit?.toISOString().slice(0, 10) ?? "", row.exitTime ?? "", row.status, row.durationMinutes ?? "", row.safetyStatus, row.safetyDeclaration?.submittedAt ?? "", row.safetyDeclaration?.checklistVersion ?? ""];
  });
  return `\uFEFF${[headers, ...values].map((line) => line.map(csvValue).join(",")).join("\r\n")}\r\n`;
}

function duration(minutes: number | null): string { return minutes == null ? "Not checked out" : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
function cells(row: AttendanceReportRow): string[] { return [`${row.employeeName}\n${row.employeeId}`, `${row.siteName}\n${row.siteCode}`, row.entryTime.replace("T", "\n").replace(".000Z", "Z"), row.exitTime ? row.exitTime.replace("T", "\n").replace(".000Z", "Z") : "Not checked out", duration(row.durationMinutes), row.safetyStatus, row.status, row.id]; }

export function buildAttendancePdf(rows: AttendanceReportRow[], filters: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28 });
    const chunks: Buffer[] = []; doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    const navy = "#102A56"; const orange = "#F28C28"; const pageWidth = 841.89; const contentWidth = pageWidth - 56; const headerHeight = 25; let y = 28; let page = 1;
    const footer = () => { doc.save().strokeColor("#CBD5E1").moveTo(28, 565).lineTo(pageWidth - 28, 565).stroke(); doc.fillColor("#64748B").font("Helvetica").fontSize(8).text("SITEPASS • Confidential attendance report", 28, 571, { width: 400 }); doc.text(`Page ${page}`, pageWidth - 100, 571, { width: 72, align: "right" }).restore(); };
    const tableHeader = () => { doc.save().fillColor(navy).rect(28, y, contentWidth, headerHeight).fill(); let x = 28; doc.fillColor("white").font("Helvetica-Bold").fontSize(7); for (const column of columns) { doc.text(column.label, x + 4, y + 8, { width: column.width - 8, lineBreak: false }); x += column.width; } doc.restore(); y += headerHeight; };
    const nextPage = () => { footer(); doc.addPage(); page += 1; y = 28; doc.fillColor(navy).font("Helvetica-Bold").fontSize(11).text("SITEPASS • Employee Attendance Report", 28, y); y += 22; tableHeader(); };

    doc.fillColor(navy).font("Helvetica-Bold").fontSize(20).text("SITEPASS", 28, y); doc.fillColor(orange).rect(28, y + 27, 65, 3).fill(); doc.fillColor(navy).fontSize(16).text("Employee Attendance Report", 28, y + 38); doc.fillColor("#475569").font("Helvetica").fontSize(9).text(`Generated: ${new Date().toISOString()} (UTC)`, 28, y + 62); doc.text(`Filters: ${filters}`, 28, y + 76, { width: contentWidth });
    const open = rows.filter((row) => row.status === "OPEN").length; doc.fillColor("#F2F6FA").roundedRect(28, y + 100, contentWidth, 42, 5).fill(); doc.fillColor(navy).font("Helvetica-Bold").fontSize(10).text(`Total records: ${rows.length}`, 42, y + 116); doc.text(`Open sessions: ${open}`, 220, y + 116); doc.text(`Closed sessions: ${rows.length - open}`, 390, y + 116); y += 158; tableHeader();
    rows.forEach((row, index) => { const values = cells(row); const heights = values.map((value, i) => doc.heightOfString(value, { width: columns[i].width - 8 })); const rowHeight = Math.max(24, Math.min(54, Math.max(...heights) + 10)); if (y + rowHeight > 555) nextPage(); if (index % 2 === 0) doc.save().fillColor("#F8FAFC").rect(28, y, contentWidth, rowHeight).fill().restore(); let x = 28; values.forEach((value, i) => { doc.fillColor("#1E293B").font("Helvetica").fontSize(7).text(value, x + 4, y + 5, { width: columns[i].width - 8, height: rowHeight - 8, ellipsis: true }); x += columns[i].width; }); doc.strokeColor("#E2E8F0").moveTo(28, y + rowHeight).lineTo(28 + contentWidth, y + rowHeight).stroke(); y += rowHeight; });
    footer(); doc.end();
  });
}
