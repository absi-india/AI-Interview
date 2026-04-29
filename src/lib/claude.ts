import { GoogleGenerativeAI } from "@google/generative-ai";
import pRetry from "p-retry";

const GEMINI_MODEL = "gemini-1.5-flash";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
  "you",
  "your",
  "this",
  "will",
  "can",
  "using",
  "use",
  "we",
  "our",
  "their",
  "they",
  "has",
  "have",
  "had",
  "must",
  "should",
  "into",
  "about",
  "after",
  "before",
  "over",
  "under",
  "via",
  "across",
  "within",
  "job",
  "description",
  "role",
  "candidate",
  "experience",
  "skills",
  "requirements",
  "developer",
  "engineer",
  "engineering",
  "software",
  "system",
  "systems",
]);

function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  // Common placeholder forms from docs/examples.
  if (key.includes("...")) return null;
  if (key.toLowerCase().includes("your-")) return null;
  if (key.toLowerCase().includes("replace")) return null;

  return key;
}

async function callGemini(system: string, user: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("GEMINI_NOT_CONFIGURED");

  const genAI = new GoogleGenerativeAI(apiKey);

  return pRetry(
    async () => {
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: system,
      });
      const result = await model.generateContent(user);
      return result.response.text();
    },
    { retries: 2, minTimeout: 800, factor: 2 }
  );
}

function isGeminiConfigOrAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("gemini_not_configured") ||
    message.includes("api key") ||
    message.includes("403") ||
    message.includes("permission_denied") ||
    message.includes("unregistered callers") ||
    message.includes("googlegenerativeai error")
  );
}

function extractKeywords(jobTitle: string, jobDescription: string, resumeContext = ""): string[] {
  const text = `${jobTitle} ${jobDescription} ${resumeContext}`.toLowerCase();
  const tokens = text.match(/[a-z0-9+#./-]{2,}/g) ?? [];
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    keywords.push(token);
    if (keywords.length >= 12) break;
  }

  if (keywords.length === 0) {
    keywords.push("software design", "testing", "debugging", "performance");
  }

  return keywords;
}

function inferLanguageHint(jobTitle: string, jobDescription: string): string | null {
  const text = `${jobTitle} ${jobDescription}`.toLowerCase();
  if (text.includes("typescript") || text.includes("react") || text.includes("node")) return "typescript";
  if (text.includes("javascript")) return "javascript";
  if (text.includes("python") || text.includes("django") || text.includes("flask")) return "python";
  if (text.includes("java") || text.includes("spring")) return "java";
  if (text.includes("c#") || text.includes(".net")) return "csharp";
  if (text.includes("golang") || text.includes(" go ")) return "go";
  if (text.includes("ruby") || text.includes("rails")) return "ruby";
  if (text.includes("php") || text.includes("laravel")) return "php";
  if (text.includes("kotlin")) return "kotlin";
  if (text.includes("swift")) return "swift";
  return null;
}

function normalizeForSimilarity(value: string) {
  return value
    .toLowerCase()
    .replace(/q\d+:\s*/g, "")
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .join(" ");
}

function similarityScore(left: string, right: string) {
  const leftWords = new Set(normalizeForSimilarity(left).split(" ").filter(Boolean));
  const rightWords = new Set(normalizeForSimilarity(right).split(" ").filter(Boolean));
  if (leftWords.size === 0 || rightWords.size === 0) return 0;

  let shared = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) shared += 1;
  }

  return shared / Math.max(leftWords.size, rightWords.size);
}

function isTooSimilar(questionText: string, existingQuestions: GeneratedQuestion[]) {
  return existingQuestions.some((question) => similarityScore(questionText, question.questionText) >= 0.62);
}

function buildFallbackQuestion(
  level: string,
  jobTitle: string,
  topic: string,
  secondaryTopic: string,
  category: string,
  index: number
) {
  const prefix = `Q${index}:`;
  const seniority = level === "BASIC" ? "clearly" : level === "ADVANCED" ? "deeply" : "practically";

  switch (category) {
    case "fundamentals":
      return `${prefix} Explain the core concepts behind ${topic} and how they matter for this ${jobTitle} role.`;
    case "problem-solving":
      return `${prefix} A production issue appears in a ${topic}-heavy feature. How would you isolate the cause and decide on a fix?`;
    case "system design":
      return `${prefix} Design a ${jobTitle} solution that uses ${topic} with ${secondaryTopic}. What are the main components and data flow?`;
    case "best practices":
      return `${prefix} What best practices would you follow when working with ${topic}, and what mistakes would you avoid?`;
    case "past experience":
      return `${prefix} Describe a past project where you used ${topic} or a similar skill. What did you personally build or improve?`;
    case "debugging":
      return `${prefix} If a ${topic} implementation becomes slow or unreliable, what signals, logs, or tests would you inspect first?`;
    case "performance":
      return `${prefix} How would you improve performance for a ${topic}-based workflow without sacrificing maintainability?`;
    case "security":
      return `${prefix} What security risks should be considered when building ${topic} features for this role?`;
    case "testing":
      return `${prefix} How would you test a feature involving ${topic}, including edge cases and failure paths?`;
    case "communication":
      return `${prefix} Explain ${topic} ${seniority} to a teammate or stakeholder who needs to understand the trade-offs.`;
    default:
      return `${prefix} How would you apply ${topic} in this ${jobTitle} role?`;
  }
}

function buildFallbackSummary(level: string, topic: string, category: string) {
  const depth =
    level === "ADVANCED"
      ? "architecture, trade-offs, scale, and failure modes"
      : level === "PRACTICAL"
        ? "implementation detail, edge cases, and validation"
        : level === "INTERMEDIATE"
          ? "practical decisions, trade-offs, and examples"
          : "correct fundamentals and a clear example";

  return `A strong answer should address ${topic} in the context of ${category}, covering ${depth}.`;
}

function fallbackQuestions(
  level: string,
  jobTitle: string,
  jobDescription: string,
  resumeContext = ""
): GeneratedQuestion[] {
  const keywords = extractKeywords(jobTitle, jobDescription, resumeContext);
  const categories = [
    "fundamentals",
    "problem-solving",
    "system design",
    "best practices",
    "past experience",
    "debugging",
    "performance",
    "security",
    "testing",
    "communication",
  ];
  const languageHint = level === "PRACTICAL" ? inferLanguageHint(jobTitle, jobDescription) : null;

  return Array.from({ length: 10 }, (_, idx) => {
    const id = idx + 1;
    const topic = keywords[idx % keywords.length];
    const secondaryTopic = keywords[(idx + 3) % keywords.length] ?? jobTitle;
    const category = categories[idx];
    return {
      id,
      questionText: buildFallbackQuestion(level, jobTitle, topic, secondaryTopic, category, id),
      category,
      expectedAnswerSummary: buildFallbackSummary(level, topic, category),
      maxScore: 10,
      codeLanguageHint: languageHint,
    };
  });
}

function normalizeQuestions(
  parsed: unknown,
  level: string,
  jobTitle: string,
  jobDescription: string,
  resumeContext = ""
): GeneratedQuestion[] {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return fallbackQuestions(level, jobTitle, jobDescription, resumeContext);
  }

  const languageHint = level === "PRACTICAL" ? inferLanguageHint(jobTitle, jobDescription) : null;
  const fallback = fallbackQuestions(level, jobTitle, jobDescription, resumeContext);

  const normalized: GeneratedQuestion[] = [];

  parsed.slice(0, 10).forEach((item, idx) => {
    const source = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const id = idx + 1;
    const candidateQuestion =
      typeof source.questionText === "string" && source.questionText.trim().length > 0
        ? source.questionText.trim()
        : fallback[idx].questionText;
    const questionText = isTooSimilar(candidateQuestion, normalized)
      ? fallback[idx].questionText
      : candidateQuestion;

    normalized.push({
      id,
      questionText,
      category:
        typeof source.category === "string" && source.category.trim().length > 0
          ? source.category.trim()
          : fallback[idx].category,
      expectedAnswerSummary:
        typeof source.expectedAnswerSummary === "string" && source.expectedAnswerSummary.trim().length > 0
          ? source.expectedAnswerSummary.trim()
          : fallback[idx].expectedAnswerSummary,
      maxScore: 10,
      codeLanguageHint:
        level === "PRACTICAL"
          ? typeof source.codeLanguageHint === "string" && source.codeLanguageHint.trim().length > 0
            ? source.codeLanguageHint.trim()
            : languageHint
          : null,
    } satisfies GeneratedQuestion);
  });

  while (normalized.length < 10) {
    normalized.push(fallback[normalized.length]);
  }

  return normalized;
}

export interface GeneratedQuestion {
  id: number;
  questionText: string;
  category: string;
  expectedAnswerSummary: string;
  maxScore: number;
  codeLanguageHint: string | null;
}

export interface AiDebugInfo {
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
}

export interface GenerateQuestionsResult {
  questions: GeneratedQuestion[];
  debug: AiDebugInfo;
}

export async function generateQuestions(
  level: string,
  jobTitle: string,
  jobDescription: string,
  resumeContext = ""
): Promise<GenerateQuestionsResult> {
  const systemPrompt = `You are a senior technical interviewer. Generate exactly 10 interview questions
based on the candidate resume, job description, and interview level below.

Interview Levels:
- BASIC: Definitions, fundamentals, conceptual understanding
- INTERMEDIATE: Applied knowledge, scenario-based, trade-offs
- ADVANCED: Architecture, system design, optimization, edge cases
- PRACTICAL: Hands-on tasks the candidate implements live (code or structured written response)

Rules:
- Return ONLY a valid JSON array. No markdown, no preamble, no explanation.
- Each object must have:
    id (1-10), questionText, category, expectedAnswerSummary,
    maxScore (always 10),
    codeLanguageHint (null unless PRACTICAL - infer from JD technologies)
- Vary categories: fundamentals, problem-solving, system design, best practices, past experience
- Vary the question format. Do not repeat the same opening phrase or sentence structure.
- Use a mix of explanation, debugging, design, testing, security, performance, past-project, and trade-off questions.
- Questions must be directly relevant to the JD's technologies and responsibilities
- Heavily tailor questions to the overlap between the candidate resume and the JD
- At least 6 questions should combine a JD requirement with something from the resume
- If the resume shows a gap against the JD, ask targeted questions that verify the missing or weak area
- Do not invent resume experience; only use details present in the resume context`;

  const userPrompt = `Interview Level: ${level}
Job Title: ${jobTitle}
Job Description: ${jobDescription}
Candidate Resume Context: ${resumeContext || "No resume context provided"}`;

  try {
    const rawResponse = await callGemini(systemPrompt, userPrompt);
    const cleaned = rawResponse.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const questions = normalizeQuestions(parsed, level, jobTitle, jobDescription, resumeContext);

    return {
      questions,
      debug: { systemPrompt, userPrompt, rawResponse },
    };
  } catch (err: unknown) {
    if (!isGeminiConfigOrAuthError(err)) {
      throw err;
    }

    const questions = fallbackQuestions(level, jobTitle, jobDescription, resumeContext);
    const reason = err instanceof Error ? err.message : "Gemini unavailable";

    return {
      questions,
      debug: {
        systemPrompt,
        userPrompt,
        rawResponse: `Fallback question generation used because Gemini was unavailable.\nReason: ${reason}`,
      },
    };
  }
}

export interface RatingResult {
  score: number;
  rationale: string;
}

function countKeywordOverlap(answer: string, expectedAnswerSummary: string, questionText: string) {
  const answerWords = new Set(normalizeForSimilarity(answer).split(" ").filter(Boolean));
  const targetWords = normalizeForSimilarity(`${expectedAnswerSummary} ${questionText}`)
    .split(" ")
    .filter(Boolean);

  if (answerWords.size === 0 || targetWords.length === 0) return 0;

  let matches = 0;
  for (const word of new Set(targetWords)) {
    if (answerWords.has(word)) matches += 1;
  }

  return matches;
}

function fallbackRating(
  level: string,
  questionText: string,
  category: string,
  expectedAnswerSummary: string,
  transcript: string | null,
  codeResponse: string | null
): RatingResult {
  const answer = `${transcript ?? ""} ${codeResponse ?? ""}`.trim();
  const wordCount = normalizeForSimilarity(answer).split(" ").filter(Boolean).length;
  const overlap = countKeywordOverlap(answer, expectedAnswerSummary, questionText);

  if (wordCount === 0) {
    return {
      score: 0,
      rationale:
        "Fallback scoring used because the AI provider is unavailable. No usable transcript or written response was captured for this question, so this needs manual recruiter review.",
    };
  }

  let score = 3;
  if (wordCount >= 12) score += 1;
  if (wordCount >= 35) score += 1;
  if (wordCount >= 80) score += 1;
  if (overlap >= 2) score += 1;
  if (overlap >= 5) score += 1;
  if ((level === "ADVANCED" || level === "PRACTICAL") && wordCount < 45) score -= 1;
  if (category.toLowerCase().includes("system") && overlap < 3) score -= 1;

  const adjustedScore = Math.max(1, Math.min(9, score));
  const detail =
    adjustedScore >= 7
      ? "The captured response has reasonable length and some overlap with the expected topic."
      : adjustedScore >= 5
        ? "The captured response is partial and should be checked for technical depth."
        : "The captured response is limited or weakly matched to the expected topic.";

  return {
    score: adjustedScore,
    rationale: `Fallback scoring used because the AI provider is unavailable. ${detail} Manual review is required before making final hiring decisions.`,
  };
}

export async function rateAnswer(
  questionText: string,
  category: string,
  expectedAnswerSummary: string,
  transcript: string | null,
  codeResponse: string | null,
  level: string
): Promise<RatingResult> {
  const system = `You are a strict but fair technical interviewer evaluating a candidate's response.
Score the response from 0 to 10 based on accuracy, depth, clarity, and relevance.
Return ONLY valid JSON. No markdown, no preamble.
Format: { "score": number, "rationale": "2-3 sentence evaluation" }`;

  const user = `Question: ${questionText}
Category: ${category}
Expected Answer Summary: ${expectedAnswerSummary}
Candidate's Spoken Transcript: ${transcript ?? "No transcript provided"}
Candidate's Code/Written Response: ${codeResponse ?? "N/A"}
Interview Level: ${level}`;

  try {
    const raw = await callGemini(system, user);
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<RatingResult>;

    if (typeof parsed.score !== "number" || typeof parsed.rationale !== "string") {
      return fallbackRating(level, questionText, category, expectedAnswerSummary, transcript, codeResponse);
    }

    return {
      score: Math.max(0, Math.min(10, parsed.score)),
      rationale: parsed.rationale,
    };
  } catch (err: unknown) {
    if (isGeminiConfigOrAuthError(err)) {
      return fallbackRating(level, questionText, category, expectedAnswerSummary, transcript, codeResponse);
    }
    throw err;
  }
}
