import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SkillPassport } from "../../shared/types.js";
import type { Credential, Reassessment } from "../../shared/advanced.js";
import { HttpError } from "./services.js";
export async function passportPdf(
  passport: SkillPassport,
  credential: Credential,
  history: Reassessment[],
  verificationUrl: string,
) {
  const serverRoot = existsSync(resolve("server/package.json"))
      ? resolve("server")
      : process.cwd(),
    font = resolve(serverRoot, "assets/fonts/TiroDevanagariHindi-Regular.ttf");
  if (!existsSync(font))
    throw new HttpError(
      503,
      "PDF generation is unavailable. Use Print / Save PDF instead.",
    );
  const qr = await QRCode.toBuffer(verificationUrl, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  return new Promise<Buffer>((resolveOutput, reject) => {
    const doc = new PDFDocument({
        size: "A4",
        margin: 44,
        bufferPages: true,
        info: {
          Title: "DakshSetu Skill Passport",
          Author: "DakshSetu",
          Subject:
            "Prototype assessor-verified competency record, not a government certificate",
        },
      }),
      chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolveOutput(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font(font);
    const navy = "#0b2a5b",
      orange = "#ee7900",
      muted = "#586983",
      width = 507;
    const clean = (s: unknown) =>
      String(s ?? "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
        .replace(/[–—]/g, "-");
    const header = () => {
      const publicLogo = resolve(
          serverRoot,
          "../client/public/dakshsetu-logo.png",
        ),
        builtLogo = resolve(serverRoot, "../client/dist/dakshsetu-logo.png"),
        logo = existsSync(publicLogo) ? publicLogo : builtLogo;
      if (existsSync(logo)) doc.image(logo, 40, 18, { fit: [110, 75] });
      doc
        .fillColor(navy)
        .fontSize(20)
        .text("DakshSetu Skill Passport", 163, 35, { width: 386 });
      doc
        .fillColor(muted)
        .fontSize(10)
        .text(
          "A bridge from practical competence to formal recognition.",
          163,
          65,
          { width: 386 },
        );
      doc
        .moveTo(44, 105)
        .lineTo(551, 105)
        .strokeColor(orange)
        .lineWidth(2)
        .stroke();
      doc.y = 123;
      doc.x = 44;
    };
    header();
    doc.on("pageAdded", header);
    const space = (height: number) => {
      if (doc.y + height > 753) doc.addPage();
    };
    const line = (
      text: string,
      options: { size?: number; color?: string; gap?: number } = {},
    ) => {
      doc.fontSize(options.size ?? 10);
      const value = clean(text),
        height = doc.heightOfString(value, { width, lineGap: 1 });
      space(height + (options.gap ?? 4));
      doc
        .fontSize(options.size ?? 10)
        .fillColor(options.color ?? navy)
        .text(value, 44, doc.y, { width, lineGap: 1 });
      doc.y += options.gap ?? 4;
    };
    const section = (title: string) => {
      space(85);
      doc.y += 9;
      line(title, { size: 15, color: navy, gap: 9 });
    };
    line(passport.workerName, { size: 24, gap: 10 });
    line(passport.trade, { size: 13, color: muted });
    line("Prototype skill record - Not a government certificate", {
      size: 10,
      color: "#92551a",
    });
    line("Credential ID: " + credential.credentialId, {
      size: 10,
      color: muted,
    });
    line(
      "Status: " +
        (credential.status === "REVOKED" ? "REVOKED" : "ASSESSOR VERIFIED") +
        " | Revision " +
        credential.revision,
      { size: 11 },
    );
    line(
      "Qualification: " +
        passport.qualificationTitle +
        " (" +
        passport.qualificationCode +
        ")",
    );
    line(
      "NSQF level: " +
        passport.nsqfLevel +
        " (demo / unverified prototype data)",
      { color: muted },
    );
    line(
      "Assessor: " +
        passport.assessorName +
        " | Assessment date: " +
        new Date(passport.signedOffAt).toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
        }),
    );
    section("Original signed-off outcome");
    line("Overall competency: " + passport.overallScore + "%", {
      size: 21,
      color: orange,
    });
    line(
      "Self-assessment: " +
        passport.selfAssessmentScore +
        "% | Approved practical: " +
        passport.practicalScore +
        "%",
    );
    line("Recommendation: " + passport.recommendation);
    line(
      "Overall uses the scoring rules recorded when this assessment began. Original assessment remains unchanged.",
      { size: 10, color: muted },
    );
    section("Knowledge competency breakdown");
    passport.competencyScores.forEach((c) =>
      line(c.name + ": " + c.score + "%"),
    );
    section("Practical criterion breakdown");
    line(
      "Original rubric observations, separate from the approved overall practical score.",
      { size: 10, color: muted },
    );
    passport.practicalCriteria.forEach((c) =>
      line(
        c.section +
          " - " +
          c.criterion +
          ": " +
          c.score +
          "/" +
          c.maxScore +
          " (weight " +
          c.weight +
          "%)",
      ),
    );
    section("Strengths");
    line(
      (passport.strengths.length
        ? passport.strengths
        : ["No independently demonstrated criteria recorded."]
      ).join("; "),
    );
    section("Areas to improve");
    line(
      (passport.gaps.length
        ? passport.gaps
        : ["No gaps identified by the original prototype rules."]
      ).join("; "),
    );
    if (history.length) {
      section("Assessor-reviewed reassessment history");
      history.forEach((h) =>
        line(
          h.competency +
            ": " +
            h.previousScore +
            "% to " +
            h.newScore +
            "% | " +
            new Date(h.completedAt!).toLocaleDateString("en-IN") +
            " | " +
            h.assessorId,
          { size: 10 },
        ),
      );
      line(
        "Reassessment entries supplement the original outcome; they do not replace its score or recommendation.",
        { size: 10, color: muted },
      );
    }
    space(150);
    section("Verify this record");
    const y = doc.y;
    doc.image(qr, 44, y, { width: 88, height: 88 });
    doc
      .fillColor(navy)
      .fontSize(10)
      .text(clean(verificationUrl), 145, y + 4, {
        width: 400,
        link: verificationUrl,
      });
    doc
      .fillColor(muted)
      .fontSize(10)
      .text(
        "Scan for the current credential status. Printed status is only a snapshot; credentials may later be updated or revoked.",
        145,
        y + 37,
        { width: 400 },
      );
    doc.y = y + 104;
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fillColor(muted)
        .fontSize(8)
        .text(
          "DakshSetu prototype | AI assists. The assessor decides. | " +
            (i + 1) +
            " / " +
            pages.count,
          44,
          799,
          { width, lineBreak: false },
        );
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
