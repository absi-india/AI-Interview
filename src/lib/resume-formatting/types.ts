// Shared types for the Resume Formatting module.
// No candidate data is ever invented — every field here is filled only from the
// text extracted from the user's uploaded resume, or left empty for the user to
// confirm.

export type TemplateId = "vectorvms" | "covendis" | "absi";

export interface ContactInfo {
  location?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  website?: string;
}

export interface EducationEntry {
  degree?: string; // e.g. "MS", "BS", "MBA"
  areaOfStudy?: string;
  school?: string;
  location?: string;
  awarded?: string; // "Yes" | "No" | ""
  date?: string; // MM/YY when available
}

export interface ExperienceEntry {
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string; // may be "Present"
  title?: string;
  bullets: string[];
  environment?: string; // technologies / environment line, when provided
}

export interface SkillCategory {
  category: string;
  skills: string[];
}

export interface CertificationEntry {
  name: string;
  issuer?: string;
  date?: string;
}

export interface ProjectEntry {
  name: string;
  description?: string;
  bullets: string[];
}

/**
 * Structured, faithful representation of the candidate's resume.
 * Anything not present in the upload stays empty — never guessed.
 */
export interface ResumeModel {
  name?: string;
  title?: string; // title / role
  contact: ContactInfo;
  requisitionNumber?: string; // VectorVMS / Ohio ITSA requisition number
  summary?: string;
  /** Summary written as bullets in the source; preserved rather than flattened. */
  summaryBullets?: string[];
  skills: SkillCategory[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  projects: ProjectEntry[];
  additional?: string;
}

export type SuggestionType =
  | "spelling"
  | "grammar"
  | "professional-wording"
  | "clarity"
  | "ats"
  | "formatting"
  | "date-inconsistency"
  | "duplicate"
  | "missing-info";

export type SuggestionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "edited"
  | "clarify";

/**
 * A single proposed content change. Nothing here is applied to the final
 * document until the user accepts it. `original` is matched verbatim against
 * the model's text so an accepted change can be applied deterministically.
 */
export interface Suggestion {
  id: string;
  type: SuggestionType;
  section: string; // human-readable affected section
  original: string;
  suggested: string;
  reason: string;
  status: SuggestionStatus;
  editedText?: string; // set when the user edits the suggestion before accepting
}

/** A question to the user when information is missing, unclear or conflicting. */
export interface ClarifyQuestion {
  id: string;
  question: string;
  field: string; // dotted hint of the target field, e.g. "contact.location"
}

export interface QualityScores {
  overall: number;
  grammar: number;
  spelling: number;
  ats: number;
  readability: number;
  formatting: number;
  professional: number;
}

export interface AnalyzeResult {
  model: ResumeModel;
  suggestions: Suggestion[];
  clarifications: ClarifyQuestion[];
  rawText: string; // original extracted text, shown in the left panel
  scores: QualityScores;
  fileName: string;
}

export const TEMPLATE_IDS: TemplateId[] = ["vectorvms", "covendis", "absi"];

export function emptyResumeModel(): ResumeModel {
  return {
    contact: {},
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    projects: [],
  };
}
