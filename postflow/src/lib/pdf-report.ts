import PDFDocument from "pdfkit";

export interface PdfReportData {
  userEmail: string;
  period: string;
  generatedAt: Date;
  kpis: {
    totalPosts: number;
    publishedPosts: number;
    scheduledPosts: number;
    failedPosts: number;
    draftPosts: number;
    overallSuccessRate: number;
    connectedAccounts: number;
  };
  platformBreakdown: {
    platform: string;
    published: number;
    failed: number;
    total: number;
    successRate: number;
  }[];
  topPosts: {
    content: string;
    score: number;
    platforms: string[];
    publishedAt: Date | null;
  }[];
  postingFrequency: {
    platform: string;
    actualPerWeek: number;
    recommendedPerWeek: number;
    pacingStatus: string;
  }[];
}

const BRAND = "#6366f1";
const DARK = "#111827";
const GRAY = "#6b7280";
const LIGHT_GRAY = "#e5e7eb";
const SUCCESS = "#16a34a";
const FAIL = "#dc2626";
const INFO = "#2563eb";
const WARN = "#d97706";

export function generateAnalyticsPdf(data: PdfReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const PAGE_WIDTH = doc.page.width - 100;

    // ── Header ─────────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 88).fill(BRAND);
    doc.fillColor("white").fontSize(22).font("Helvetica-Bold").text("PostFlow Analytics Report", 50, 20);
    doc.fontSize(10).font("Helvetica").text(data.userEmail, 50, 48);
    const periodLine = `${data.period}  ·  Generated ${data.generatedAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`;
    doc.text(periodLine, 50, 64);

    let y = 108;

    function ensurePage(needed = 120) {
      if (y + needed > doc.page.height - 60) {
        doc.addPage();
        y = 50;
      }
    }

    function sectionTitle(title: string) {
      ensurePage(40);
      doc.fillColor(BRAND).fontSize(13).font("Helvetica-Bold").text(title, 50, y);
      y += 6;
      doc
        .moveTo(50, y)
        .lineTo(50 + PAGE_WIDTH, y)
        .strokeColor(BRAND)
        .lineWidth(1)
        .stroke();
      y += 14;
      doc.fillColor(DARK).font("Helvetica").fontSize(10);
    }

    // ── KPI Summary ────────────────────────────────────────────────────────────
    sectionTitle("Performance Summary");

    const kpis = data.kpis;
    const BOX_W = 100;
    const BOX_H = 60;
    const BOX_GAP = 8;
    const kpiItems: { label: string; value: string; color: string }[] = [
      { label: "Total Posts", value: String(kpis.totalPosts), color: DARK },
      { label: "Published", value: String(kpis.publishedPosts), color: SUCCESS },
      { label: "Scheduled", value: String(kpis.scheduledPosts), color: INFO },
      { label: "Failed", value: String(kpis.failedPosts), color: kpis.failedPosts > 0 ? FAIL : DARK },
      {
        label: "Success Rate",
        value: `${kpis.overallSuccessRate}%`,
        color:
          kpis.overallSuccessRate >= 80 ? SUCCESS : kpis.overallSuccessRate >= 50 ? WARN : FAIL,
      },
    ];

    for (let i = 0; i < kpiItems.length; i++) {
      const bx = 50 + i * (BOX_W + BOX_GAP);
      const by = y;
      doc.rect(bx, by, BOX_W, BOX_H).fillColor("#f3f4f6").fill();
      doc
        .fillColor(kpiItems[i]!.color)
        .fontSize(18)
        .font("Helvetica-Bold")
        .text(kpiItems[i]!.value, bx, by + 8, { width: BOX_W, align: "center" });
      doc
        .fillColor(GRAY)
        .fontSize(8)
        .font("Helvetica")
        .text(kpiItems[i]!.label, bx + 4, by + 38, { width: BOX_W - 8, align: "center" });
    }
    y += BOX_H + 20;

    // Connected accounts
    doc
      .fillColor(GRAY)
      .fontSize(9)
      .text(`Connected accounts: ${kpis.connectedAccounts}`, 50, y);
    y += 20;

    // ── Platform Breakdown ─────────────────────────────────────────────────────
    const activePlatforms = data.platformBreakdown.filter((p) => p.total > 0);
    if (activePlatforms.length > 0) {
      sectionTitle("Platform Breakdown");

      // Table header
      doc.fontSize(9).font("Helvetica-Bold").fillColor(GRAY);
      doc.text("Platform", 50, y, { width: 120 });
      doc.text("Published", 170, y, { width: 80 });
      doc.text("Failed", 255, y, { width: 70 });
      doc.text("Total", 325, y, { width: 70 });
      doc.text("Success Rate", 395, y, { width: 100 });
      y += 14;
      doc.moveTo(50, y).lineTo(50 + PAGE_WIDTH, y).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      y += 8;

      doc.fontSize(10).font("Helvetica");
      for (const p of activePlatforms) {
        ensurePage(22);
        const name = p.platform.charAt(0) + p.platform.slice(1).toLowerCase().replace(/_/g, " ");
        doc.fillColor(DARK).text(name, 50, y, { width: 120 });
        doc.fillColor(SUCCESS).text(String(p.published), 170, y, { width: 80 });
        doc.fillColor(p.failed > 0 ? FAIL : DARK).text(String(p.failed), 255, y, { width: 70 });
        doc.fillColor(DARK).text(String(p.total), 325, y, { width: 70 });
        const srColor = p.successRate >= 80 ? SUCCESS : p.successRate >= 50 ? WARN : FAIL;
        doc.fillColor(srColor).text(`${p.successRate}%`, 395, y, { width: 100 });
        y += 18;
      }
      y += 10;
    }

    // ── Top Performing Posts ───────────────────────────────────────────────────
    if (data.topPosts.length > 0) {
      sectionTitle("Top Performing Posts");

      for (const [i, post] of data.topPosts.entries()) {
        const preview =
          post.content.replace(/\s+/g, " ").slice(0, 130) +
          (post.content.length > 130 ? "…" : "");
        const platforms = post.platforms
          .map((pl) => pl.charAt(0) + pl.slice(1).toLowerCase())
          .join(", ");
        const publishedStr = post.publishedAt
          ? post.publishedAt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—";

        const blockHeight = 14 + doc.heightOfString(preview, { width: PAGE_WIDTH }) + 16;
        ensurePage(blockHeight);

        doc
          .fillColor(GRAY)
          .fontSize(9)
          .font("Helvetica")
          .text(`#${i + 1}`, 50, y);
        doc.fillColor(INFO).text(`Score: ${Math.round(post.score)}`, 65, y);
        doc.fillColor(GRAY).text(`  ·  ${platforms}  ·  ${publishedStr}`, 130, y);
        y += 14;
        doc.fontSize(10).fillColor(DARK).font("Helvetica").text(preview, 50, y, {
          width: PAGE_WIDTH,
        });
        y += doc.heightOfString(preview, { width: PAGE_WIDTH }) + 8;
        doc
          .moveTo(50, y)
          .lineTo(50 + PAGE_WIDTH, y)
          .strokeColor(LIGHT_GRAY)
          .lineWidth(0.5)
          .stroke();
        y += 8;
      }
      y += 10;
    }

    // ── Posting Frequency ──────────────────────────────────────────────────────
    const activeFreq = data.postingFrequency.filter((pf) => pf.actualPerWeek > 0);
    if (activeFreq.length > 0) {
      sectionTitle("Posting Frequency");

      doc.fontSize(9).font("Helvetica-Bold").fillColor(GRAY);
      doc.text("Platform", 50, y, { width: 130 });
      doc.text("Actual/Week", 185, y, { width: 100 });
      doc.text("Recommended", 285, y, { width: 110 });
      doc.text("Status", 395, y, { width: 100 });
      y += 14;
      doc.moveTo(50, y).lineTo(50 + PAGE_WIDTH, y).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      y += 8;

      doc.fontSize(10).font("Helvetica");
      for (const pf of activeFreq) {
        ensurePage(22);
        const name = pf.platform.charAt(0) + pf.platform.slice(1).toLowerCase().replace(/_/g, " ");
        const statusColor =
          pf.pacingStatus === "optimal" ? SUCCESS : pf.pacingStatus === "over" ? WARN : FAIL;
        doc.fillColor(DARK).text(name, 50, y, { width: 130 });
        doc.text(pf.actualPerWeek.toFixed(1), 185, y, { width: 100 });
        doc.text(String(pf.recommendedPerWeek), 285, y, { width: 110 });
        doc
          .fillColor(statusColor)
          .text(
            pf.pacingStatus.charAt(0).toUpperCase() + pf.pacingStatus.slice(1),
            395,
            y,
            { width: 100 }
          );
        y += 18;
      }
    }

    // ── Footers ────────────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const fy = doc.page.height - 38;
      doc
        .moveTo(50, fy)
        .lineTo(doc.page.width - 50, fy)
        .strokeColor(LIGHT_GRAY)
        .lineWidth(0.5)
        .stroke();
      doc
        .fillColor(GRAY)
        .fontSize(8)
        .font("Helvetica")
        .text(`PostFlow  ·  Page ${i + 1} of ${range.count}`, 50, fy + 8, {
          align: "center",
          width: doc.page.width - 100,
        });
    }

    doc.end();
  });
}
