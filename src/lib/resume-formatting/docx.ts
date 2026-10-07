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
import {
  CAI_BLUE,
  CAI_NAVY,
  CAI_TEAL,
  getTemplate,
  labelFor,
  type CaiProgram,
  type SectionKey,
} from "./templates";
import { splitBulletLabel } from "./segment";
import type { ResumeModel, TemplateId } from "./types";

const BODY_FONT = "Arial";
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
    alignment: AlignmentType.CENTER,
    children: [run(model.name || "Candidate Name", { bold: true, size: 32, color })],
  });
}

function contactLine(model: ResumeModel, hideDetails: boolean) {
  // Ohio ITSA submissions omit phone / email / LinkedIn — location only.
  if (hideDetails) {
    if (!model.contact.location) return null;
    return new Paragraph({
      spacing: { after: 120 },
      alignment: AlignmentType.CENTER,
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
    alignment: AlignmentType.CENTER,
    children: [run(parts.join("  |  "), { size: 18, color: "444444" })],
  });
}

// ── Section heading variants ──
/** Ohio ITSA heading: plain accent text, with no rule beneath it. */
function plainHeading(text: string, color: string) {
  return new Paragraph({
    spacing: { before: 180, after: 60 },
    children: [run(text.toUpperCase(), { bold: true, size: 32, color })],
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
        size: 20,
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

/**
 * ABSI heading: accent text on a light shaded bar with a thin border, as in the
 * reference resume. A shaded paragraph rather than a table, so it never affects
 * how the document paginates.
 */
function boxedHeading(text: string, color: string) {
  const edge = { style: BorderStyle.SINGLE, size: 4, color: "AFAFAF", space: 4 };
  return new Paragraph({
    shading: { type: ShadingType.SOLID, color: "E8E8E8", fill: "E8E8E8" },
    border: { top: edge, bottom: edge, left: edge, right: edge },
    spacing: { before: 180, after: 100 },
    keepNext: true,
    children: [run(text.toUpperCase(), { bold: true, size: 20, color })],
  });
}

// ── CAI letterhead ───────────────────────────────────────────────────────────
/** No border at all, for the letterhead bar's own cells. */
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = {
  top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
};

/**
 * The navy bar across the top of every CAI page: "CAI" and the contract name
 * on the left, a teal "Managed Services Program" tab on the right. A header,
 * so Word repeats it on each page as the reference letterhead does.
 */
function caiHeaderBar(program: CaiProgram) {
  const cell = (fill: string, children: TextRun[], align: (typeof AlignmentType)[keyof typeof AlignmentType], width: number) =>
    new TableCell({
      shading: { type: ShadingType.SOLID, color: fill, fill },
      width: { size: width, type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 140, right: 140 },
      children: [new Paragraph({ alignment: align, children })],
    });

  return new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              cell(CAI_NAVY, [
                run("CAI  ", { bold: true, size: 26, color: "FFFFFF" }),
                run(`${program.headerLabel} — Resume Template`, { size: 18, color: "D8E3EF" }),
              ], AlignmentType.LEFT, 68),
              cell(CAI_TEAL, [
                run("Managed Services Program", { size: 16, color: "FFFFFF" }),
              ], AlignmentType.RIGHT, 32),
            ],
          }),
        ],
      }),
    ],
  });
}

/** "CAI Resume Template" and the contract line beneath it, on page one only. */
function caiTitleBlock(program: CaiProgram) {
  return [
    new Paragraph({
      spacing: { before: 60, after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CAI_BLUE, space: 4 } },
      children: [run("CAI Resume Template", { bold: true, size: 40, color: CAI_NAVY })],
    }),
    new Paragraph({
      spacing: { before: 60, after: 120 },
      children: [run(program.contractLine, { bold: true, size: 18, color: CAI_BLUE })],
    }),
  ];
}

/** The named CAI people for this contract. Indiana lists none. */
function caiContactBlock(program: CaiProgram) {
  if (!program.contacts.length) return [];
  const out: Paragraph[] = [
    new Paragraph({
      spacing: { before: 60, after: 40 },
      children: [run("CAI Program Contact", { bold: true, size: 20, color: CAI_NAVY })],
    }),
  ];
  program.contacts.forEach((c, i) => {
    if (i > 0) {
      out.push(new Paragraph({ spacing: { after: 20 }, children: [run("or", { size: 18, color: "808080" })] }));
    }
    out.push(new Paragraph({ spacing: { after: 10 }, children: [run(c.name, { bold: true, size: 18 })] }));
    out.push(
      new Paragraph({
        spacing: { after: 30 },
        children: [run(`Phone: ${c.phone}    Email: ${c.email}`, { size: 18, color: "222222" })],
      }),
    );
  });
  return out;
}

/** CAI section heading: navy, with the blue rule the reference draws beneath. */
function caiHeading(text: string) {
  return new Paragraph({
    spacing: { before: 200, after: 0 },
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: CAI_BLUE, space: 3 } },
    children: [run(text, { bold: true, size: 24, color: CAI_NAVY })],
  });
}

function heading(key: SectionKey, tmplId: TemplateId): (Paragraph | Table)[] {
  const tmpl = getTemplate(tmplId);
  const label = labelFor(key, tmplId);
  if (!label) return [];
  if (tmpl.cai) return [caiHeading(label)];
  if (tmpl.underlinedHeadings) return [underlinedHeading(label)];
  if (tmpl.boxedHeadings) return [boxedHeading(label, tmpl.accent)];
  return [plainHeading(label, tmpl.accent)];
}

// ── Body builders ──
function bulletRuns(text: string) {
  const split = splitBulletLabel(text);
  if (!split) return [run(text)];
  return [run(split.label, { bold: true }), run(split.rest)];
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 20 },
    alignment: AlignmentType.JUSTIFIED,
    children: bulletRuns(text),
  });
}

function summaryPara(model: ResumeModel) {
  const out: Paragraph[] = [];
  if (model.summary) {
    out.push(
      new Paragraph({
        spacing: { after: 80 },
        alignment: AlignmentType.JUSTIFIED,
        children: [run(model.summary)],
      }),
    );
  }
  // A summary written as bullets in the source stays bulleted.
  for (const b of model.summaryBullets ?? []) out.push(bullet(b));
  return out;
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

function experienceBlock(model: ResumeModel, environmentLabel = "Environment") {
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
      out.push(new Paragraph({ spacing: { after: 40 }, alignment: AlignmentType.JUSTIFIED, children: [run(`${environmentLabel}: `, { bold: true }), run(e.environment)] }));
    }
  }
  return out;
}

/** A bordered table with a filled header row, as both CAI and PA ITSA use. */
function gridTable(
  headers: string[],
  rows: (string | undefined)[][],
  opts: { headerFill: string; headerColor: string; border: string },
) {
  const edge = { style: BorderStyle.SINGLE, size: 2, color: opts.border };
  const borders = {
    top: edge, bottom: edge, left: edge, right: edge,
    insideHorizontal: edge, insideVertical: edge,
  };
  const margins = { top: 50, bottom: 50, left: 80, right: 80 };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: opts.headerFill, fill: opts.headerFill },
          margins,
          children: [new Paragraph({ children: [run(h, { bold: true, size: 19, color: opts.headerColor })] })],
        }),
    ),
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      headerRow,
      ...rows.map(
        (cells) =>
          new TableRow({
            children: cells.map(
              (v) =>
                new TableCell({
                  margins,
                  children: [new Paragraph({ children: [run(v || "", { size: 19 })] })],
                }),
            ),
          }),
      ),
    ],
  });
}

/**
 * CAI's skill / years-of-experience grid. The years column is deliberately
 * left blank: the resume does not state a figure per skill, and inventing one
 * on a document the client relies on would be worse than a gap the recruiter
 * fills in.
 */
function skillsYearsTable(model: ResumeModel) {
  const rows: (string | undefined)[][] = [];
  for (const group of model.skills) {
    for (const skill of group.skills) rows.push([skill, ""]);
  }
  if (!rows.length) return [];
  return [
    gridTable(["Skill", "Years of Experience"], rows, {
      headerFill: CAI_NAVY,
      headerColor: "FFFFFF",
      border: "CCCCCC",
    }),
  ];
}

/** PA ITSA's certification grid. Unstated columns stay empty, never guessed. */
function certificationsTable(model: ResumeModel) {
  if (!model.certifications.length) return [];
  const rows = model.certifications.map((c) => [c.name, c.issuer, c.date, "", ""]);
  return [
    gridTable(
      ["Certification", "Issued By", "Date Obtained (MM/YY)", "Certification Number", "Expiration Date"],
      rows,
      { headerFill: "F2F2F2", headerColor: "000000", border: "BFBFBF" },
    ),
  ];
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
    return new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, alignment: AlignmentType.JUSTIFIED, children: [run(c.name + (extra ? ` — ${extra}` : ""))] });
  });
}

function projectsBlock(model: ResumeModel) {
  const out: Paragraph[] = [];
  for (const p of model.projects) {
    out.push(new Paragraph({ spacing: { before: 60, after: 10 }, keepNext: true, children: [run(p.name, { bold: true })] }));
    if (p.description) out.push(new Paragraph({ spacing: { after: 20 }, alignment: AlignmentType.JUSTIFIED, children: [run(p.description)] }));
    p.bullets.forEach((b) => out.push(bullet(b)));
  }
  return out;
}

function simpleField(label: string, value: string | undefined) {
  if (!value) return [];
  return [new Paragraph({ spacing: { after: 30 }, children: [run(`${label}: `, { bold: true }), run(value)] })];
}

/**
 * Ohio ITSA pairs the title/role with the requisition number on one line, the
 * requisition aligned to the right margin, as the official form does. Labels on
 * the first line, values beneath them.
 */
function titleAndRequisition(model: ResumeModel, color: string, requisitionLabel = "Requisition Number") {
  const tab = [{ type: TabStopType.RIGHT, position: FULL_WIDTH_TWIP }];
  return [
    new Paragraph({
      tabStops: tab,
      spacing: { before: 120, after: 0 },
      keepNext: true,
      children: [
        run("Title/Role:", { bold: true, color }),
        run(`\t${requisitionLabel}:`, { bold: true, color }),
      ],
    }),
    new Paragraph({
      tabStops: tab,
      spacing: { after: 120 },
      children: [
        run(model.title || "—", { bold: true }),
        run(`\t${model.requisitionNumber || "Not Available"}`, { bold: true }),
      ],
    }),
  ];
}

// ── Section dispatcher ──
/** Body content of a headed section, without the heading itself. */
function sectionBody(key: SectionKey, model: ResumeModel, tmplId: TemplateId): (Paragraph | Table)[] {
  switch (key) {
    case "summary":
      return summaryPara(model);
    case "skills":
      return getTemplate(tmplId).skillsYearsTable ? skillsYearsTable(model) : skillsBlock(model);
    case "experience":
      return experienceBlock(model, getTemplate(tmplId).environmentLabel);
    case "education": {
      const tmpl = getTemplate(tmplId);
      const edu = tmpl.educationTable ? [educationTable(model)] : educationBlock(model);
      // CAI gives education and certifications a single heading, so the
      // certificates follow the degrees under it rather than standing alone.
      return tmpl.educationWithCertifications ? [...edu, ...certsBlock(model)] : edu;
    }
    case "certifications": {
      const tmpl = getTemplate(tmplId);
      if (tmpl.educationWithCertifications) return []; // emitted with education
      return tmpl.certificationsTable ? certificationsTable(model) : certsBlock(model);
    }
    case "projects":
      return projectsBlock(model);
    case "additional":
      return model.additional ? [new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [run(model.additional)] })] : [];
    default:
      return [];
  }
}

function buildSection(key: SectionKey, model: ResumeModel, tmplId: TemplateId): (Paragraph | Table)[] {
  const tmpl = getTemplate(tmplId);

  // Un-headed identity fields render the same way in every template.
  switch (key) {
    case "header":
      // CAI puts its title and programme contacts in the body; the navy bar
      // above them is a running header. Ohio's logo is a running header too.
      return tmpl.cai ? [...caiTitleBlock(tmpl.cai), ...caiContactBlock(tmpl.cai)] : [];
    case "name":
      return tmpl.cai
        ? [
            new Paragraph({
              spacing: { before: 160, after: 20 },
              alignment: AlignmentType.CENTER,
              children: [run(model.name || "Candidate Name", { bold: true, size: 32, color: CAI_NAVY })],
            }),
          ]
        : [nameParagraph(model, tmpl.accent)];
    case "contact": {
      // CAI asks for the location alone, centred under the name.
      if (tmpl.cai) {
        return model.contact.location
          ? [
              new Paragraph({
                spacing: { after: 60 },
                alignment: AlignmentType.CENTER,
                children: [run(model.contact.location, { bold: true, size: 22, color: CAI_BLUE })],
              }),
            ]
          : [];
      }
      const c = contactLine(model, tmpl.hideContactDetails);
      return c ? [c] : [];
    }
    case "title":
      // Ohio ITSA renders both on one line, emitted with the requisition key.
      return tmpl.titleAndRequisitionOnOneLine ? [] : simpleField("Title / Role", model.title);
    case "requisition":
      return tmpl.titleAndRequisitionOnOneLine
        ? titleAndRequisition(model, tmpl.accent, tmpl.requisitionLabel)
        : simpleField(tmpl.requisitionLabel ?? "VectorVMS Requisition Number", model.requisitionNumber || "Not Available");
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
  if (tmpl.cai) {
    header = caiHeaderBar(tmpl.cai);
    topMargin = convertInchesToTwip(0.85); // clear the letterhead bar
  } else if (tmpl.repeatingLogo) {
    const logo = await loadLogo();
    if (logo) {
      header = new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
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
  // e.g. OHITS_Resume-Abrar Syeda.docx
  const parts = (model.name || "")
    .replace(/[^A-Za-z\s'.-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  // Characters Windows and macOS refuse in a file name.
  const candidate = [first, last].filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "").trim() || "Candidate";
  return `${getTemplate(tmplId).fileSuffix}_Resume-${candidate}.docx`;
}
