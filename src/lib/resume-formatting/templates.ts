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
  /** Whether major headings render inside solid blue boxes (Covendis). */
  blueHeadingBoxes: boolean;
  /**
   * Covendis: each section is drawn as an outlined box — a blue heading bar on
   * top with the section content enclosed underneath.
   */
  boxedSections: boolean;
  /**
   * Ohio ITSA submissions go to the client without personal contact details;
   * only the candidate's current location is shown.
   */
  hideContactDetails: boolean;
  /** Whether education renders as a structured table (Ohio). */
  educationTable: boolean;
  fileSuffix: string; // used in the download file name
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
    accent: "1F3864",
    repeatingLogo: true,
    blueHeadingBoxes: false,
    boxedSections: false,
    hideContactDetails: true,
    educationTable: true,
    fileSuffix: "VectorVMS",
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
    blueHeadingBoxes: true,
    boxedSections: true,
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
    accent: "0F172A",
    repeatingLogo: false,
    blueHeadingBoxes: false,
    boxedSections: false,
    hideContactDetails: false,
    educationTable: false,
    fileSuffix: "ABSI",
  },
};

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
