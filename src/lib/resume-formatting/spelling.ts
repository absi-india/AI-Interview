import { fixPunctuation } from "./punctuation";
import type { ResumeModel, Suggestion } from "./types";

/**
 * Deterministic spelling fixes.
 *
 * The AI review is told to look for spelling, but it is also told to prefer a
 * small number of high-value suggestions, so individual typos are exactly what
 * it drops. These are found with rules instead: every occurrence, every time.
 *
 * The list is deliberately a fixed set of unambiguous misspellings rather than
 * a dictionary. A dictionary flags "OmniStudio", "Vlocity", "Copado" and every
 * surname and city on a technical resume, and a reviewer who is shown ten false
 * alarms stops reading the real one. British spellings — organisation,
 * optimise, analyse, centre, programme, licence — are correct and are not
 * listed. Nothing is applied until the user accepts it.
 */

const MISSPELLINGS: Record<string, string> = {
  // Everyday words that turn up misspelt on resumes
  accomodate: "accommodate", accomodated: "accommodated", acheive: "achieve",
  acheived: "achieved", acheivement: "achievement", acheivements: "achievements",
  adress: "address", adressed: "addressed", alot: "a lot", analize: "analyze",
  analized: "analyzed", analysys: "analysis", aplication: "application",
  aplications: "applications", apparant: "apparent", aquire: "acquire",
  aquired: "acquired", arguement: "argument", assesment: "assessment",
  assesments: "assessments", availabe: "available", availble: "available",
  beleive: "believe", benifit: "benefit", benifits: "benefits",
  buisness: "business", bussiness: "business", calender: "calendar",
  carrer: "career", catagory: "category", colaborate: "collaborate",
  colaborated: "collaborated", colaboration: "collaboration",
  comunicate: "communicate", comunication: "communication",
  compatability: "compatibility", competetive: "competitive",
  completly: "completely", consistant: "consistent", consistancy: "consistency",
  continous: "continuous", continously: "continuously", controll: "control",
  coordinater: "coordinator", costumer: "customer", costumers: "customers",
  definately: "definitely", definitly: "definitely", dependant: "dependent",
  developement: "development", diffrent: "different", effeciency: "efficiency",
  efficency: "efficiency", enviroment: "environment", enviroments: "environments",
  environmet: "environment", equiped: "equipped", excelent: "excellent",
  experiance: "experience", expertese: "expertise", familar: "familiar",
  finacial: "financial", flexability: "flexibility", fourty: "forty",
  fullfill: "fulfil", garantee: "guarantee", goverment: "government",
  heirarchy: "hierarchy", hierachy: "hierarchy", improvment: "improvement",
  independant: "independent", knowlege: "knowledge",
  knowledgable: "knowledgeable", liason: "liaison", liasion: "liaison",
  maintainance: "maintenance", maintenence: "maintenance",
  maintanence: "maintenance", managment: "management", manger: "manager",
  mantain: "maintain", neccessary: "necessary", necesary: "necessary",
  occassion: "occasion", occured: "occurred", occuring: "occurring",
  oportunity: "opportunity", paralel: "parallel", particurly: "particularly",
  personel: "personnel", posses: "possess", possesion: "possession",
  practicle: "practical", prefered: "preferred", presance: "presence",
  priorty: "priority", profesional: "professional", proffesional: "professional",
  recieve: "receive", recieved: "received", reciept: "receipt",
  recomend: "recommend", recomendation: "recommendation",
  recomended: "recommended", refered: "referred", relevent: "relevant",
  reponsible: "responsible", responsable: "responsible",
  responsibilites: "responsibilities", responsiblities: "responsibilities",
  responsibilties: "responsibilities", seperate: "separate",
  seperated: "separated", seperation: "separation", similiar: "similar",
  succesful: "successful", sucessful: "successful", successfull: "successful",
  succesfully: "successfully", sucessfully: "successfully", sucess: "success",
  supervisior: "supervisor", suport: "support", suported: "supported",
  teh: "the", thier: "their", throughly: "thoroughly", untill: "until",
  usefull: "useful", verfication: "verification", wich: "which",
  writting: "writing",

  // Vocabulary specific to technical resumes
  architecure: "architecture", architecutre: "architecture",
  automatation: "automation", certificaiton: "certification",
  clinet: "client", configration: "configuration",
  configuraton: "configuration", databse: "database", datbase: "database",
  deploymnet: "deployment", desgin: "design", developped: "developed",
  documentaion: "documentation", enhancment: "enhancement",
  enterprice: "enterprise", excecution: "execution", fucntion: "function",
  funtion: "function", impelmented: "implemented",
  implemenation: "implementation", implementaion: "implementation",
  implemneted: "implemented", infrastucture: "infrastructure",
  integraton: "integration", intergration: "integration",
  intigration: "integration", lenght: "length", migraton: "migration",
  moduel: "module", optimze: "optimize", optimied: "optimized",
  paramter: "parameter", paramters: "parameters", perfomance: "performance",
  performace: "performance", performence: "performance", plattform: "platform",
  proccess: "process", procsess: "process", produciton: "production",
  prodcution: "production", programing: "programming", qualtiy: "quality",
  quailty: "quality", releated: "related", reponse: "response",
  requirment: "requirement", requirments: "requirements",
  ressource: "resource", scalabilty: "scalability", scurity: "security",
  secuirty: "security", serivce: "service", servcie: "service",
  sofware: "software", solutons: "solutions", stategy: "strategy",
  stratergy: "strategy", sysem: "system", sytem: "system", sytems: "systems",
  techincal: "technical", techncial: "technical", tecnical: "technical",
  techology: "technology", technolgy: "technology", tesing: "testing",
  testng: "testing", troubleshoting: "troubleshooting", vlaue: "value",
  wokring: "working", workign: "working",
};

/**
 * Words safe to report when doubled. A general "same word twice" rule also
 * matches "had had" and "that that", which are correct English.
 */
const DOUBLE_WORDS = [
  "the", "and", "to", "of", "in", "for", "with", "a", "an", "is", "are",
  "was", "were", "on", "at", "by", "from", "as", "that",
];

const MISSPELLING_RE = new RegExp(`\\b(${Object.keys(MISSPELLINGS).join("|")})\\b`, "gi");
const DOUBLE_RE = new RegExp(`\\b(${DOUBLE_WORDS.join("|")})(\\s+)\\1\\b`, "gi");

/** Keep the writer's capitalisation: "Enviroment" → "Environment". */
function matchCase(source: string, replacement: string): string {
  if (source === source.toUpperCase() && source.length > 1) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * One suggestion per sentence, correcting everything wrong in it at once.
 *
 * Raising a separate suggestion per word would mean two cards quoting almost
 * the same sentence, each undoing the other's context, and a second typo in a
 * short bullet would be dropped as a duplicate of the first.
 */
function fixSentence(sentence: string): { fixed: string; notes: string[] } {
  const notes: string[] = [];

  MISSPELLING_RE.lastIndex = 0;
  let fixed = sentence.replace(MISSPELLING_RE, (word) => {
    const correct = matchCase(word, MISSPELLINGS[word.toLowerCase()]);
    notes.push(`${word} → ${correct}`);
    return correct;
  });

  DOUBLE_RE.lastIndex = 0;
  fixed = fixed.replace(DOUBLE_RE, (_all, word: string) => {
    notes.push(`"${word}" was repeated`);
    return word;
  });

  return { fixed, notes };
}

/** Sentences, keeping the trailing space so the text can be rebuilt exactly. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])(?=\s)/);
}

function scanText(
  text: string,
  section: string,
  seen: Set<string>,
  makeId: () => string,
): Suggestion[] {
  const out: Suggestion[] = [];
  if (!text || text.length < 3) return out;

  for (const sentence of sentences(text)) {
    const original = sentence.trim();
    if (original.length < 3 || seen.has(original)) continue;

    const { fixed, notes } = fixSentence(original);
    if (fixed === original) continue;

    // Tidy the punctuation of the same sentence while we are rewriting it.
    // The punctuation pass quotes a narrower snippet, which would no longer
    // match once this suggestion has corrected the words around it, so its fix
    // has to be carried here or it would be silently lost.
    const settled = fixPunctuation(fixed);
    if (settled !== fixed) notes.push("punctuation tidied");

    seen.add(original);
    out.push({
      id: makeId(),
      type: "spelling",
      section,
      original,
      suggested: settled,
      reason: `Spelling: ${notes.join(", ")}.`,
      status: "pending",
    });
  }

  return out;
}

/** Spelling suggestions across every text field of the resume. */
export function spellingSuggestions(model: ResumeModel, makeId: () => string): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];

  const add = (text: string | undefined, section: string) => {
    if (!text) return;
    out.push(...scanText(text, section, seen, makeId));
  };

  add(model.summary, "Professional Summary");
  (model.summaryBullets ?? []).forEach((b) => add(b, "Professional Summary"));
  model.experience.forEach((e) => {
    add(e.title, "Professional Experience");
    e.bullets.forEach((b) => add(b, "Professional Experience"));
    add(e.environment, "Professional Experience");
  });
  model.projects.forEach((p) => {
    add(p.description, "Projects");
    p.bullets.forEach((b) => add(b, "Projects"));
  });
  add(model.additional, "Additional Information");

  return out.slice(0, 40);
}
