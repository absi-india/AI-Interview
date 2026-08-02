import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  ImageRun,
  Packer,
  PageBorderDisplay,
  PageBorderOffsetFrom,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx";
import { getTemplate, SECTION_LABEL, type SectionKey } from "./templates";
import type { ResumeModel, TemplateId } from "./types";

const BODY_FONT = "Calibri";
const FULL_WIDTH_TWIP = convertInchesToTwip(7.5); // 8.5" letter - 0.5" margins each side

// ── Logo (read from /public so it deploys; reference/ is untracked) ──
let cachedLogo: Buffer | null | undefined;
async function loadLogo(): Promise<Buffer | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    cachedLogo = await readFile(path.join(process.cwd(), "public", "ohio-itsa-logo.png"));
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

// ── Small run helpers ──
function run(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text,
    bold: opts.bold,
    italics: opts.italics,
    size: opts.size ?? 20,
    color: opts.color,
    font: BODY_FONT,
  });
}

function nameParagraph(model: ResumeModel, color: string) {
  return new Paragraph({
    spacing: { after: 40 },
    children: [run(model.name || "Candidate Name", { bold: true, size: 32, color })],
  });
}

function contactLine(model: ResumeModel, hideDetails: boolean) {
  // Ohio ITSA submissions omit phone / email / LinkedIn — location only.
  if (hideDetails) {
    if (!model.contact.location) return null;
    return new Paragraph({
      spacing: { after: 120 },
      children: [run("Current location: ", { bold: true }), run(model.contact.location)],
    });
  }

  const parts = [
    model.contact.location,
    model.contact.phone,
    model.contact.email,
    model.contact.linkedin,
    model.contact.website,
  ].filter(Boolean) as string[];
  if (!parts.length) return null;
  return new Paragraph({
    spacing: { after: 120 },
    children: [run(parts.join("  |  "), { size: 18, color: "444444" })],
  });
}

// ── Section heading variants ──
function plainHeading(text: string, color: string) {
  return new Paragraph({
    spacing: { before: 180, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 2 } },
    children: [run(text.toUpperCase(), { bold: true, size: 22, color })],
  });
}

/**
 * Covendis heading: bold and underlined on a plain background, matching the
 * reference. The separation between sections comes from the frame's internal
 * rules, not from a filled bar.
 */
function underlinedHeading(text: string) {
  return new Paragraph({
    spacing: { before: 20, after: 60 },
    keepNext: true,
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        underline: {},
        size: 22,
        color: "000000",
        font: BODY_FONT,
      }),
    ],
  });
}

/**
 * Covendis: ONE box around the whole body. This is a single-cell table whose
 * row is allowed to split, so when the content flows past the bottom of a page
 * Word closes the border there and redraws it at the top of the next page —
 * giving one box per page rather than a box per section.
 */
/**
 * Horizontal rule drawn after a section: an empty paragraph carrying a bottom
 * border. Content flows normally around it, so it never affects pagination.
 */
function sectionRule(accent: string) {
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 1 } },
    children: [],
  });
}

/**
 * Covendis frame. Drawn with Word's own page borders rather than a wrapping
 * table: Word repeats them on every page automatically, so the content flows
 * normally and no page can be left half empty by a table row that refuses to
 * split.
 */
function covendisPageBorders(accent: string) {
  const edge = { style: BorderStyle.SINGLE, size: 6, color: accent, space: 18 };
  return {
    pageBorders: {
      display: PageBorderDisplay.ALL_PAGES,
      offsetFrom: PageBorderOffsetFrom.TEXT,
    },
    pageBorderTop: edge,
    pageBorderRight: edge,
    pageBorderBottom: edge,
    pageBorderLeft: edge,
  };
}

function heading(key: SectionKey, tmplId: TemplateId): (Paragraph | Table)[] {
  const tmpl = getTemplate(tmplId);
  const label = SECTION_LABEL[key];
  if (!label) return [];
  if (tmpl.underlinedHeadings) {
    return [underlinedHeading(label)];
  }
  return [plainHeading(label, tmpl.accent)];
}

// ── Body builders ──
function bullet(text: string) {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [run(text)] });
}

function summaryPara(model: ResumeModel) {
  if (!model.summary) return [];
  return [new Paragraph({ spacing: { after: 80 }, children: [run(model.summary)] })];
}

function skillsBlock(model: ResumeModel) {
  if (!model.skills.length) return [];
  return model.skills.map(
    (s) =>
      new Paragraph({
        spacing: { after: 30 },
        children: [
          run(`${s.category}: `, { bold: true }),
          run(s.skills.join(", ")),
        ],
      }),
  );
}

function experienceBlock(model: ResumeModel) {
  const out: Paragraph[] = [];
  for (const e of model.experience) {
    const dates = [e.startDate, e.endDate].filter(Boolean).join(" – ");
    const companyLine = [e.company, e.location].filter(Boolean).join(", ");
    out.push(
      new Paragraph({
        spacing: { before: 100, after: 10 },
        tabStops: [{ type: TabStopType.RIGHT, position: FULL_WIDTH_TWIP }],
        children: [
          run(companyLine || "Company", { bold: true }),
          ...(dates ? [run(`\t${dates}`, { bold: true })] : []),
        ],
        // keep the company/title header with the first bullet
        keepNext: true,
      }),
    );
    if (e.title) {
      out.push(new Paragraph({ spacing: { after: 30 }, keepNext: true, children: [run(e.title, { italics: true })] }));
    }
    e.bullets.forEach((b) => out.push(bullet(b)));
    if (e.environment) {
      out.push(new Paragraph({ spacing: { after: 40 }, children: [run("Environment: ", { bold: true }), run(e.environment)] }));
    }
  }
  return out;
}

function educationTable(model: ResumeModel) {
  const headers = ["Degree", "Area of Study", "School / University", "Location", "Awarded?", "Date"];
  const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: "F2F2F2", fill: "F2F2F2" },
          margins: { top: 30, bottom: 30, left: 60, right: 60 },
          children: [new Paragraph({ children: [run(h, { bold: true, size: 16 })] })],
        }),
    ),
  });
  const rows = model.education.map(
    (e) =>
      new TableRow({
        children: [e.degree, e.areaOfStudy, e.school, e.location, e.awarded, e.date].map(
          (v) =>
            new TableCell({
              margins: { top: 30, bottom: 30, left: 60, right: 60 },
              children: [new Paragraph({ children: [run(v || "", { size: 16 })] })],
            }),
        ),
      }),
  );
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows: [headerRow, ...rows] });
}

function educationBlock(model: ResumeModel) {
  return model.education.map((e) => {
    const left = [e.degree, e.areaOfStudy].filter(Boolean).join(", ");
    const right = [e.school, e.location].filter(Boolean).join(", ");
    const date = e.date ? `  (${e.date})` : "";
    return new Paragraph({
      spacing: { after: 40 },
      children: [run(left || right, { bold: true }), ...(right && left ? [run(` — ${right}${date}`)] : [run(date)])],
    });
  });
}

function certsBlock(model: ResumeModel) {
  return model.certifications.map((c) => {
    const extra = [c.issuer, c.date].filter(Boolean).join(", ");
    return new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [run(c.name + (extra ? ` — ${extra}` : ""))] });
  });
}

function projectsBlock(model: ResumeModel) {
  const out: Paragraph[] = [];
  for (const p of model.projects) {
    out.push(new Paragraph({ spacing: { before: 60, after: 10 }, keepNext: true, children: [run(p.name, { bold: true })] }));
    if (p.description) out.push(new Paragraph({ spacing: { after: 20 }, children: [run(p.description)] }));
    p.bullets.forEach((b) => out.push(bullet(b)));
  }
  return out;
}

function simpleField(label: string, value: string | undefined) {
  if (!value) return [];
  return [new Paragraph({ spacing: { after: 30 }, children: [run(`${label}: `, { bold: true }), run(value)] })];
}

// ── Section dispatcher ──
/** Body content of a headed section, without the heading itself. */
function sectionBody(key: SectionKey, model: ResumeModel, tmplId: TemplateId): (Paragraph | Table)[] {
  switch (key) {
    case "summary":
      return summaryPara(model);
    case "skills":
      return skillsBlock(model);
    case "experience":
      return experienceBlock(model);
    case "education":
      return getTemplate(tmplId).educationTable ? [educationTable(model)] : educationBlock(model);
    case "certifications":
      return certsBlock(model);
    case "projects":
      return projectsBlock(model);
    case "additional":
      return model.additional ? [new Paragraph({ children: [run(model.additional)] })] : [];
    default:
      return [];
  }
}

function buildSection(key: SectionKey, model: ResumeModel, tmplId: TemplateId): (Paragraph | Table)[] {
  const tmpl = getTemplate(tmplId);

  // Un-headed identity fields render the same way in every template.
  switch (key) {
    case "header":
      return []; // handled by the running header
    case "name":
      return [nameParagraph(model, tmpl.accent)];
    case "contact": {
      const c = contactLine(model, tmpl.hideContactDetails);
      return c ? [c] : [];
    }
    case "title":
      return simpleField("Title / Role", model.title);
    case "requisition":
      return simpleField("VectorVMS Requisition Number", model.requisitionNumber || "Not Available");
    default:
      break;
  }

  const body = sectionBody(key, model, tmplId);
  if (!body.length) return [];

  return [...heading(key, tmplId), ...body];
}

export async function buildResumeDocx(model: ResumeModel, tmplId: TemplateId): Promise<Buffer> {
  const tmpl = getTemplate(tmplId);
  const children: (Paragraph | Table)[] = [];

  if (tmpl.boxedSections) {
    // Covendis: identity lines sit above the frame, everything else goes inside
    // ONE box that Word redraws on each page the content flows onto.
    // Content flows normally; the frame comes from page borders and the
    // dividers are rules between sections.
    const IDENTITY: SectionKey[] = ["header", "name", "contact", "title", "requisition"];
    const above: (Paragraph | Table)[] = [];
    const sections: (Paragraph | Table)[][] = [];
    for (const key of tmpl.order) {
      const parts = buildSection(key, model, tmplId);
      if (!parts.length) continue;
      if (IDENTITY.includes(key)) above.push(...parts);
      else sections.push(parts);
    }
    children.push(...above);
    sections.forEach((parts, i) => {
      if (i > 0) children.push(sectionRule(tmpl.accent));
      children.push(...parts);
    });
  } else {
    for (const key of tmpl.order) {
      children.push(...buildSection(key, model, tmplId));
    }
  }

  // Ohio ITSA logo repeats on every page via a default header (no title page).
  let header: Header | undefined;
  let topMargin = convertInchesToTwip(0.5);
  if (tmpl.repeatingLogo) {
    const logo = await loadLogo();
    if (logo) {
      header = new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 60 },
            children: [
              new ImageRun({
                type: "png",
                data: logo,
                transformation: { width: 320, height: 56 }, // preserves the file's own aspect ratio (no distortion)
              }),
            ],
          }),
        ],
      });
      topMargin = convertInchesToTwip(1.15); // clear space so body never overlaps the logo
    }
  }

  const doc = new Document({
    creator: "ABSI TIP — Resume Formatting",
    sections: [
      {
        properties: {
          page: {
            size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
            margin: {
              top: topMargin,
              right: convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.5),
              left: convertInchesToTwip(0.5),
              header: convertInchesToTwip(0.3),
              footer: convertInchesToTwip(0.3),
            },
            // Covendis: Word draws this frame on every page by itself.
            ...(tmpl.boxedSections ? { borders: covendisPageBorders(tmpl.accent) } : {}),
          },
        },
        headers: header ? { default: header } : undefined,
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export function resumeFileName(model: ResumeModel, tmplId: TemplateId): string {
  const safeName = (model.name || "Candidate").replace(/[^A-Za-z0-9]+/g, "") || "Candidate";
  return `${safeName}_${getTemplate(tmplId).fileSuffix}_Resume.docx`;
}
