import type { TemplateId } from "./types";

export type SectionKey =
  | "header" // Ohio logo banner
  | "name"
  | "contact"
  | "title"
  | "requisition"
  | "summary"
  | "skills"
  | "experience"
  | "projects"
  | "education"
  | "certifications"
  | "additional";

// Taken from the CAI reference documents rather than chosen: the navy of the
// headings and the letterhead bar, the blue of the rules beneath each heading,
// and the teal of the "Managed Services Program" tab.
export const CAI_NAVY = "164070";
export const CAI_BLUE = "0071BC";
export const CAI_TEAL = "007983";

/** A named person on the CAI side of a state contract, printed on the cover. */
export interface CaiContact {
  name: string;
  phone: string;
  email: string;
}

/**
 * The parts of a CAI letterhead that change between state contracts. The
 * layout, colours and section order are identical across all of them, so only
 * these three things are stated per jurisdiction.
 */
export interface CaiProgram {
  /** Right of "CAI" in the running header bar, e.g. "Indiana MSP Contract". */
  headerLabel: string;
  /** The line under the title, naming the contract. */
  contractLine: string;
  /** Program contacts, printed above the candidate's name. */
  contacts: CaiContact[];
}

export interface TemplateDef {
  id: TemplateId;
  name: string;
  shortName: string;
  description: string;
  /** Section order as rendered in preview and export. */
  order: SectionKey[];
  /** Primary accent colour (hex without #). */
  accent: string;
  /** Whether the Ohio ITSA logo header repeats on every page. */
  repeatingLogo: boolean;
  /** Covendis: section headings are bold and underlined, with no fill behind them. */
  underlinedHeadings: boolean;
  /**
   * Covendis: the body sits inside one frame that is redrawn on every page,
   * with a horizontal rule separating each section.
   */
  boxedSections: boolean;
  /**
   * Ohio ITSA submissions go to the client without personal contact details;
   * only the candidate's current location is shown.
   */
  hideContactDetails: boolean;
  /** ABSI: headings sit in a shaded, bordered box with the accent colour text. */
  boxedHeadings: boolean;
  /**
   * Ohio ITSA: title/role and requisition number share one line, the
   * requisition number aligned to the right margin as in the official form.
   */
  titleAndRequisitionOnOneLine: boolean;
  /** Whether education renders as a structured table (Ohio). */
  educationTable: boolean;
  fileSuffix: string; // used in the download file name

  // ── CAI letterhead family (Indiana, Virginia, Georgia, Iowa) ──
  /** Set on the CAI templates; absent on every other one. */
  cai?: CaiProgram;
  /** CAI: skills render as a Skill / Years of Experience table. */
  skillsYearsTable?: boolean;
  /** CAI: certifications sit under the education heading, not their own. */
  educationWithCertifications?: boolean;
  /** Section headings that differ from the shared defaults. */
  labelOverrides?: Partial<Record<SectionKey, string>>;

  // ── ITSA family wording ──
  /** The VMS named on the requisition line. Defaults to VectorVMS. */
  requisitionLabel?: string;
  /** PA ITSA: certifications render as a structured table. */
  certificationsTable?: boolean;
  /** PA ITSA calls the per-job technology line "Key Technologies/Skills". */
  environmentLabel?: string;
}

/**
 * Everything a CAI template shares. Only the jurisdiction, the contacts and
 * whether the contract asks for a skills table differ, so the rest is stated
 * once here instead of being copied five times.
 */
function caiTemplate(
  id: TemplateId,
  name: string,
  shortName: string,
  fileSuffix: string,
  description: string,
  cai: CaiProgram,
  opts: { skillsYearsTable: boolean },
): TemplateDef {
  return {
    id,
    name,
    shortName,
    description,
    // Certifications are folded into the education heading, so the key is
    // left out of the order entirely.
    order: [
      "header",
      "name",
      "contact",
      ...(opts.skillsYearsTable ? (["summary", "skills"] as SectionKey[]) : (["summary"] as SectionKey[])),
      "experience",
      "education",
    ],
    accent: CAI_NAVY,
    repeatingLogo: false,
    underlinedHeadings: false,
    boxedSections: false,
    boxedHeadings: false,
    titleAndRequisitionOnOneLine: false,
    // CAI asks for contact details to be stripped, keeping only city and state.
    hideContactDetails: true,
    educationTable: false,
    fileSuffix,
    cai,
    skillsYearsTable: opts.skillsYearsTable,
    educationWithCertifications: true,
    labelOverrides: {
      summary: "Professional Summary",
      skills: "Skills & Years of Experience",
      experience: "Employment History",
      education: "Education & Certifications",
    },
  };
}

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  vectorvms: {
    id: "vectorvms",
    name: "VectorVMS / Ohio ITSA",
    shortName: "Ohio ITSA",
    description:
      "Official Ohio ITSA layout with the OST / OHIO ITSA logo repeated on every page, a structured education table, and requisition fields. Required for VectorVMS submissions.",
    order: [
      "header",
      "name",
      "contact",
      "title",
      "requisition",
      "education",
      "certifications",
      "experience",
      "summary",
      "skills",
    ],
    accent: "1F497D",
    repeatingLogo: true,
    underlinedHeadings: false,
    boxedSections: false,
    boxedHeadings: false,
    titleAndRequisitionOnOneLine: true,
    hideContactDetails: true,
    educationTable: true,
    fileSuffix: "OHITS",
  },
  covendis: {
    id: "covendis",
    name: "Covendis",
    shortName: "Covendis",
    description:
      "Professional boxed design with blue-highlighted section heading bars. Consistent section order, aligned dates and titles, ATS-readable content.",
    order: [
      "name",
      "contact",
      "summary",
      "skills",
      "experience",
      "education",
      "certifications",
      "projects",
      "additional",
    ],
    accent: "1F4E79",
    repeatingLogo: false,
    underlinedHeadings: true,
    boxedSections: true,
    boxedHeadings: false,
    titleAndRequisitionOnOneLine: false,
    hideContactDetails: true,
    educationTable: false,
    fileSuffix: "Covendis",
  },
  absi: {
    id: "absi",
    name: "ABSI Standard Resume",
    shortName: "ABSI",
    description:
      "Clean, modern, ATS-friendly resume. Simple headings, no unnecessary graphics or tables, selectable text — ideal for general applications and recruiter submissions.",
    order: [
      "name",
      "contact",
      "summary",
      "skills",
      "experience",
      "projects",
      "education",
      "certifications",
      "additional",
    ],
    accent: "1F497D",
    repeatingLogo: false,
    underlinedHeadings: false,
    boxedSections: false,
    boxedHeadings: true,
    titleAndRequisitionOnOneLine: false,
    hideContactDetails: false,
    educationTable: false,
    fileSuffix: "ABSI",
  },

  paitsa: {
    id: "paitsa",
    name: "PA ITSA (PeopleFluent)",
    shortName: "PA ITSA",
    description:
      "Pennsylvania IT Staff Augmentation submission. Education and certifications as structured tables, requisition fields, and per-role key technologies — as the Commonwealth's PeopleFluent template requires.",
    order: [
      "name",
      "contact",
      "title",
      "requisition",
      "education",
      "certifications",
      "experience",
      "summary",
      "skills",
    ],
    accent: "1F497D",
    repeatingLogo: false,
    underlinedHeadings: false,
    boxedSections: false,
    boxedHeadings: false,
    titleAndRequisitionOnOneLine: true,
    hideContactDetails: true,
    educationTable: true,
    certificationsTable: true,
    requisitionLabel: "PeopleFluent Requisition Number",
    environmentLabel: "Key Technologies/Skills",
    // The Commonwealth's template names these two sections differently.
    labelOverrides: {
      experience: "Employment History",
      certifications: "Certifications and Certificates",
    },
    fileSuffix: "PAITSA",
  },

  indiana: caiTemplate(
    "indiana",
    "CAI — State of Indiana",
    "Indiana",
    "Indiana",
    "CAI letterhead for the State of Indiana Managed Services Provider Contract. Contact details stripped to city and state, with a skills and years-of-experience table.",
    {
      headerLabel: "Indiana MSP Contract",
      contractLine: "State of Indiana Managed Services Provider Contract  ·  Managed by CAI",
      contacts: [],
    },
    { skillsYearsTable: true },
  ),

  virginia: caiTemplate(
    "virginia",
    "CAI — Commonwealth of Virginia",
    "Virginia",
    "Virginia",
    "CAI letterhead for the Commonwealth of Virginia IT Contingent Labor Contract, including the program contacts and a skills and years-of-experience table.",
    {
      headerLabel: "Virginia IT Contingent Labor Contract",
      contractLine: "Commonwealth of Virginia IT Contingent Labor Contract  ·  Managed by CAI",
      contacts: [
        { name: "Kevin Brooks", phone: "804-840-6399", email: "kevin.brooks@cai.io" },
        { name: "Joanne Wilson", phone: "804-426-2001", email: "joanne.wilson@cai.io" },
        { name: "Kevin Lynch", phone: "919-291-0168", email: "kevin.lynch@cai.io" },
      ],
    },
    { skillsYearsTable: true },
  ),

  georgia: caiTemplate(
    "georgia",
    "CAI — State of Georgia",
    "Georgia",
    "Georgia",
    "CAI letterhead for the State of Georgia IT Staffing Services Contract, including the program contacts and a skills and years-of-experience table.",
    {
      headerLabel: "Georgia IT Staffing Contract",
      contractLine: "State of Georgia IT Staffing Services Contract  ·  Managed by CAI",
      contacts: [
        { name: "Tim Brodrick", phone: "678-427-3660", email: "Timothy.Brodrick@cai.io" },
        { name: "Susan Lewis-Yizar", phone: "678-427-3349", email: "Susan.Lewis-Yizar@cai.io" },
        { name: "Tommy Tompkins", phone: "501-249-6388", email: "Tommy.Tompkins@cai.io" },
      ],
    },
    { skillsYearsTable: true },
  ),

  iowa: caiTemplate(
    "iowa",
    "CAI — State of Iowa",
    "Iowa",
    "Iowa",
    "CAI letterhead for the Iowa IT Managed Services Contract. The Iowa template asks for summary, employment history and education only — there is no skills table.",
    {
      headerLabel: "Iowa IT Managed Services Contract",
      contractLine: "Iowa IT Managed Services Contract  ·  Managed by CAI",
      contacts: [
        { name: "Shannon Swenson", phone: "(515) 381-8869", email: "Shannon.Swenson@cai.io" },
      ],
    },
    { skillsYearsTable: false },
  ),
};

/** The heading a template uses for a section, which CAI contracts reword. */
export function labelFor(key: SectionKey, tmplId: TemplateId): string {
  return getTemplate(tmplId).labelOverrides?.[key] ?? SECTION_LABEL[key];
}

export const SECTION_LABEL: Record<SectionKey, string> = {
  header: "",
  name: "Name",
  contact: "Contact Information",
  title: "Title / Role",
  requisition: "VectorVMS Requisition Number",
  summary: "Professional Summary",
  skills: "Technical Skills",
  experience: "Professional Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  additional: "Additional Information",
};

export function getTemplate(id: TemplateId): TemplateDef {
  return TEMPLATES[id];
}
