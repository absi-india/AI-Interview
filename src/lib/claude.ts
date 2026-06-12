import { GoogleGenerativeAI } from "@google/generative-ai";
import pRetry from "p-retry";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_GENERATION_TIMEOUT_MS = 12000;
const GEMINI_RATING_TIMEOUT_MS = 20000;
const GEMINI_RATING_RETRIES = 1;
const GEMINI_RATING_RETRY_DELAY_MS = 1200;

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
  "business",
  "analyst",
  "analysis",
  "advanced",
  "basic",
  "intermediate",
  "practical",
  "order",
  "rank",
  "importance",
  "required",
  "require",
  "requires",
  "requirement",
  "requirements",
  "feature",
  "features",
  "year",
  "years",
  "jd",
  "dis",
  "full",
  "scope",
  "admin",
  "project",
  "projects",
  "writer",
  "technical",
  "analyst",
]);

const LOW_VALUE_KEYWORDS = new Set([
  "api",
  "apis",
  "app",
  "apps",
  "basic",
  "candidate",
  "description",
  "dis",
  "full",
  "jd",
  "job",
  "project",
  "role",
  "scope",
  "technical",
  "writer",
]);

const DOMAIN_PHRASES = [
  "business analyst",
  "technical writer",
  "medicaid policy documentation",
  "medicaid modernization",
  "healthcare authorization",
  "claims processing",
  "requirements gathering",
  "business requirements",
  "business process analysis",
  "test case design",
  "test cases",
  "uat",
  "user acceptance testing",
  "traceability matrix",
  "jira",
  "confluence",
  "azure devops",
  "sql",
  "agile sdlc",
  "defect triage",
  "stakeholder communication",
  "healthcare compliance",
  "eligibility validation",
  "facets",
  "mmis",
];

const TECHNOLOGY_PHRASES = [
  "python api",
  "rest api",
  "flask api",
  "django api",
  "fastapi",
  "api integration",
  "api testing",
  "api documentation",
  "business requirements",
  "technical documentation",
  "process documentation",
  "requirements gathering",
  "stakeholder communication",
];

function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  // Common placeholder forms from docs/examples.
  if (key.includes("...")) return null;
  if (key.toLowerCase().includes("your-")) return null;
  if (key.toLowerCase().includes("replace")) return null;

  return key;
}

async function callGemini(system: string, user: string, timeoutMs = GEMINI_GENERATION_TIMEOUT_MS): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("GEMINI_NOT_CONFIGURED");

  const genAI = new GoogleGenerativeAI(apiKey);

  return pRetry(
    async () => {
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: system,
      });
      const result = await model.generateContent(user, { timeout: timeoutMs });
      return result.response.text();
    },
    { retries: 0 }
  );
}

function isGeminiConfigOrAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("gemini_not_configured") ||
    message.includes("api key") ||
    message.includes("403") ||
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("not supported") ||
    message.includes("aborted") ||
    message.includes("timeout") ||
    message.includes("permission_denied") ||
    message.includes("unregistered callers") ||
    message.includes("googlegenerativeai error")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiForRating(system: string, user: string): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= GEMINI_RATING_RETRIES; attempt += 1) {
    try {
      return await callGemini(system, user, GEMINI_RATING_TIMEOUT_MS);
    } catch (err: unknown) {
      lastError = err;
      if (!isGeminiConfigOrAuthError(err) || attempt === GEMINI_RATING_RETRIES) break;
      await sleep(GEMINI_RATING_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function extractKeywords(jobDescription: string): string[] {
  const text = jobDescription.toLowerCase();
  const phraseMatches = [...TECHNOLOGY_PHRASES, ...DOMAIN_PHRASES].filter((phrase) => text.includes(phrase));
  const tokens = text.match(/[a-z0-9+#./-]{2,}/g) ?? [];
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const phrase of phraseMatches) {
    seen.add(phrase);
    keywords.push(phrase);
  }

  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    if (LOW_VALUE_KEYWORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (token.length < 4 && !["c#", "go"].includes(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    keywords.push(token);
    if (keywords.length >= 12) break;
  }

  if (keywords.length === 0) {
    if (text.includes("python") && text.includes("api")) {
      keywords.push("Python API design", "request validation", "error handling", "API testing");
    } else if (text.includes("python")) {
      keywords.push("Python fundamentals", "debugging Python code", "data handling", "testing Python logic");
    } else if (text.includes("healthcare")) {
      keywords.push("healthcare requirements", "claims workflows", "test case design", "stakeholder communication");
    } else {
      keywords.push("solution design", "testing strategy", "debugging approach", "performance analysis");
    }
  }

  if (keywords.length < 4 && text.includes("api")) {
    for (const keyword of ["API design", "API testing", "error handling", "request validation"]) {
      if (!seen.has(keyword.toLowerCase())) keywords.push(keyword);
    }
  }

  return keywords.slice(0, 12);
}

function inferLanguageHint(jobDescription: string): string | null {
  const text = jobDescription.toLowerCase();
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

function isTooSimilarToAny(questionText: string, existingQuestions: string[]) {
  return existingQuestions.some((question) => similarityScore(questionText, question) >= 0.62);
}

function hasLowQualityTopic(questionText: string) {
  const normalized = normalizeForSimilarity(questionText);
  const words = normalized.split(" ").filter(Boolean);
  const lowValueMatches = words.filter((word) => LOW_VALUE_KEYWORDS.has(word));
  return lowValueMatches.length > 0 && lowValueMatches.length >= Math.ceil(words.length * 0.25);
}

function isUsableQuestion(questionText: string) {
  const trimmed = questionText.trim();
  if (!trimmed.endsWith("?")) return false;
  if (trimmed.length < 35) return false;
  if (/\b(jd|dis|full|scope|admin)\b/i.test(trimmed)) return false;
  if (/\b(related to|for|involving)\s+(writer|analyst|technical)\b/i.test(trimmed)) return false;
  if (hasLowQualityTopic(trimmed)) return false;
  return true;
}

function buildFallbackQuestion(
  level: string,
  topic: string,
  secondaryTopic: string,
  category: string,
  variant = 0
) {
  const seniority = level === "BASIC" ? "clearly" : level === "ADVANCED" ? "deeply" : "practically";
  const variantIndex = variant % 3;

  switch (category) {
    case "fundamentals":
      if (variantIndex === 1) return `What are the most important fundamentals behind ${topic}, and where do candidates commonly misunderstand them in this role?`;
      if (variantIndex === 2) return `Can you walk through a real example that demonstrates ${topic}, including the assumptions and limits of your approach?`;
      return `How would you explain the core concepts behind ${topic} and how they matter for this position?`;
    case "problem-solving":
      if (variantIndex === 1) return `Given a failed outcome involving ${topic}, what questions would you ask first and what evidence would you collect?`;
      if (variantIndex === 2) return `How would you compare two possible fixes for an issue involving ${topic} and choose the better one?`;
      return `A problem appears in a workflow involving ${topic}. How would you isolate the cause, validate the impact, and recommend a fix?`;
    case "system design":
      if (variantIndex === 1) return `Propose a workflow that uses ${topic} and ${secondaryTopic}. What handoffs, data checks, and failure points would you plan for?`;
      if (variantIndex === 2) return `How would you redesign an existing process around ${topic} to make it more reliable, measurable, and easier to maintain?`;
      return `Design a practical approach for connecting ${topic} with ${secondaryTopic}. What artifacts, data flow, and stakeholder checkpoints would you define?`;
    case "best practices":
      if (variantIndex === 1) return `Which standards or habits would you enforce for ${topic}, and how would you know the team is following them?`;
      if (variantIndex === 2) return `What trade-offs would guide your decisions when applying ${topic} under delivery pressure?`;
      return `What best practices would you follow when working with ${topic}, and what mistakes would you avoid?`;
    case "past experience":
      if (variantIndex === 1) return `Tell me about a time you had to learn or apply ${topic}. What changed because of your work?`;
      if (variantIndex === 2) return `Can you describe the most relevant experience you have with ${topic}, including your role, constraints, and result?`;
      return `Can you describe a past project where you used ${topic} or a similar skill, and what you personally owned, improved, or documented?`;
    case "debugging":
      if (variantIndex === 1) return `A stakeholder reports inconsistent results related to ${topic}. How would you reproduce, narrow, and communicate the issue?`;
      if (variantIndex === 2) return `What indicators would tell you whether a ${topic} problem is caused by data, process, tooling, or user behavior?`;
      return `If a process related to ${topic} becomes slow or unreliable, what signals, logs, reports, or tests would you inspect first?`;
    case "performance":
      if (variantIndex === 1) return `How would you measure whether changes to ${topic} actually improved speed, quality, or throughput?`;
      if (variantIndex === 2) return `Where would you look for bottlenecks in a workflow involving ${topic}, and what would you optimize first?`;
      return `How would you improve performance or turnaround time for a ${topic}-based workflow without sacrificing accuracy or traceability?`;
    case "security":
      if (variantIndex === 1) return `What controls would you put around ${topic} to reduce privacy, compliance, or access risks?`;
      if (variantIndex === 2) return `How would you handle sensitive data, auditability, and permissions in a process involving ${topic}?`;
      return `What privacy, compliance, or access-control risks should be considered when working with ${topic} in this role?`;
    case "testing":
      if (variantIndex === 1) return `How would you create a test strategy for ${topic}, and what positive, negative, and regression cases would you include?`;
      if (variantIndex === 2) return `How would you prove that a change involving ${topic} is ready for release or stakeholder sign-off?`;
      return `How would you test a change involving ${topic}, including edge cases, regression coverage, and acceptance criteria?`;
    case "communication":
      if (variantIndex === 1) return `How would you brief a non-technical stakeholder on progress, risks, and decisions related to ${topic}?`;
      if (variantIndex === 2) return `When explaining ${topic}, how would you adapt your message for teammates, managers, and business users?`;
      return `How would you explain ${topic} ${seniority} to a teammate or stakeholder who needs to understand risks, trade-offs, and next steps?`;
    default:
      return `How would you apply ${topic} for the responsibilities described in this role?`;
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
  jobDescription: string,
  avoidQuestions: string[] = []
): GeneratedQuestion[] {
  const keywords = extractKeywords(jobDescription);
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
  const languageHint = level === "PRACTICAL" ? inferLanguageHint(jobDescription) : null;
  const usedQuestions: string[] = [...avoidQuestions];
  const regenerationOffset = avoidQuestions.length > 0 ? Math.max(1, avoidQuestions.length % keywords.length) : 0;
  const variantOffset = avoidQuestions.length > 0 ? Math.max(1, Math.floor(avoidQuestions.length / 10)) : 0;

  return Array.from({ length: 10 }, (_, idx) => {
    const id = idx + 1;
    const category = categories[(idx + regenerationOffset) % categories.length];
    let topic = keywords[(idx + regenerationOffset) % keywords.length];
    let questionText = "";

    for (let attempt = 0; attempt < keywords.length * 3; attempt += 1) {
      topic = keywords[(idx + attempt + regenerationOffset) % keywords.length];
      const secondaryTopic = keywords[(idx + attempt + regenerationOffset + 3) % keywords.length] ?? "the listed responsibilities";
      const candidate = buildFallbackQuestion(level, topic, secondaryTopic, category, Math.floor(attempt / keywords.length) + variantOffset);
      if (isUsableQuestion(candidate) && !isTooSimilarToAny(candidate, usedQuestions)) {
        questionText = candidate;
        break;
      }
      if (!questionText && isUsableQuestion(candidate)) questionText = candidate;
    }

    if (!questionText) {
      questionText = buildFallbackQuestion(level, topic, "the listed responsibilities", category, 2);
    }

    usedQuestions.push(questionText);

    return {
      id,
      questionText,
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
  jobDescription: string,
  avoidQuestions: string[] = []
): GeneratedQuestion[] {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return fallbackQuestions(level, jobDescription, avoidQuestions);
  }

  const languageHint = level === "PRACTICAL" ? inferLanguageHint(jobDescription) : null;
  const fallback = fallbackQuestions(level, jobDescription, avoidQuestions);

  const normalized: GeneratedQuestion[] = [];
  const usedQuestions = [...avoidQuestions];

  parsed.slice(0, 10).forEach((item, idx) => {
    const source = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const id = idx + 1;
    const candidateQuestion =
      typeof source.questionText === "string" && source.questionText.trim().length > 0
        ? source.questionText.trim()
        : fallback[idx].questionText;
    const cleanedQuestion = candidateQuestion.replace(/^q\s*\d+\s*[:.)-]\s*/i, "").trim();
    const questionText = !isUsableQuestion(cleanedQuestion) || isTooSimilarToAny(cleanedQuestion, usedQuestions)
      ? fallback[idx].questionText
      : cleanedQuestion;
    usedQuestions.push(questionText);

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
    const nextQuestion = fallback[normalized.length];
    normalized.push(nextQuestion);
    usedQuestions.push(nextQuestion.questionText);
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
  _jobTitle: string,
  jobDescription: string,
  avoidQuestions: string[] = []
): Promise<GenerateQuestionsResult> {
  const previousQuestionsText =
    avoidQuestions.length > 0
      ? avoidQuestions.map((question, idx) => `${idx + 1}. ${question}`).join("\n")
      : "None";

  const systemPrompt = `You are a senior technical interviewer. Generate exactly 10 interview questions
using only the job description and interview level below.

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
- Questions must be directly relevant to the JD's technologies, responsibilities, deliverables, workflows, and required skills.
- Treat the JD as the only source of truth for topics, tools, domain, business processes, and required skills.
- Do not use candidate resume skills, past projects, employers, keywords, or uploaded resume text when choosing question topics.
- Do not use the job title as a source for question topics, technologies, domain, seniority, or responsibilities
- Do not ask about technologies, tools, or workflows unless they appear in the JD.
- Past-experience questions are allowed, but they must ask about JD responsibilities, not resume-specific experience.
- If previous questions are provided, do not repeat or lightly rephrase them; generate new angles, scenarios, constraints, and evaluation points.
- Avoid generic filler questions when the JD provides specific responsibilities or tools.
- Do not use bare filler words such as JD, dis, full, scope, admin, project, technical, analyst, or writer as standalone topics.
- Every question must be a complete sentence ending with a question mark.`;

  const userPrompt = `Interview Level: ${level}
Job Description: ${jobDescription}
Candidate Resume Context: intentionally excluded. Generate from the JD only.
Previous Questions To Avoid:
${previousQuestionsText}
Regeneration Seed: ${avoidQuestions.length > 0 ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : "first-generation"}`;

  try {
    const rawResponse = await callGemini(systemPrompt, userPrompt);
    const cleaned = rawResponse.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const questions = normalizeQuestions(parsed, level, jobDescription, avoidQuestions);

    return {
      questions,
      debug: { systemPrompt, userPrompt, rawResponse },
    };
  } catch (err: unknown) {
    if (!isGeminiConfigOrAuthError(err)) {
      throw err;
    }

    const questions = fallbackQuestions(level, jobDescription, avoidQuestions);
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

export interface BatchRatingInput {
  id: string;
  questionText: string;
  category: string;
  expectedAnswerSummary: string;
  transcript: string | null;
  codeResponse: string | null;
  hasVideo?: boolean;
}

export interface BatchRatingResult extends RatingResult {
  id: string;
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

function getSimilarityWords(value: string) {
  return normalizeForSimilarity(value).split(" ").filter(Boolean);
}

function isQuestionEcho(answer: string, questionText: string) {
  const answerWords = getSimilarityWords(answer);
  const questionWords = new Set(getSimilarityWords(questionText));

  if (answerWords.length === 0 || questionWords.size === 0) return false;

  const shared = answerWords.filter((word) => questionWords.has(word)).length;
  const answerQuestionRatio = shared / answerWords.length;
  const questionCoverage = shared / questionWords.size;

  return answerWords.length <= 35 && answerQuestionRatio >= 0.75 && questionCoverage >= 0.55;
}

function fallbackRating(
  level: string,
  questionText: string,
  category: string,
  expectedAnswerSummary: string,
  transcript: string | null,
  codeResponse: string | null,
  hasVideo = false
): RatingResult {
  const answer = `${transcript ?? ""} ${codeResponse ?? ""}`.trim();
  const wordCount = normalizeForSimilarity(answer).split(" ").filter(Boolean).length;
  const overlap = countKeywordOverlap(answer, expectedAnswerSummary, questionText);

  if (wordCount === 0) {
    return {
      score: 0,
      rationale:
        hasVideo
          ? "A video recording is available, but no usable transcript was captured for this question. Manual recruiter review of the recording is required."
          : "No usable transcript or written response was captured for this question, so this needs manual recruiter review.",
    };
  }

  if (isQuestionEcho(answer, questionText)) {
    return {
      score: 0,
      rationale:
        "The captured response appears to repeat the interview question rather than answer it, so this needs manual recruiter review.",
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
    rationale: `${detail} Manual recruiter review is recommended before making final hiring decisions.`,
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
  if (isQuestionEcho(`${transcript ?? ""} ${codeResponse ?? ""}`, questionText)) {
    return {
      score: 0,
      rationale:
        "The captured response appears to repeat the interview question rather than answer it. No credit should be awarded unless manual review finds a substantive answer in the recording.",
    };
  }

  const system = `You are a strict but fair technical interviewer evaluating a candidate's response.
Score the response from 0 to 10 based on accuracy, depth, clarity, and relevance.
If the candidate only repeats or paraphrases the question without answering, score 0.
Return ONLY valid JSON. No markdown, no preamble.
Format: { "score": number, "rationale": "2-3 sentence evaluation" }`;

  const user = `Question: ${questionText}
Category: ${category}
Expected Answer Summary: ${expectedAnswerSummary}
Candidate's Spoken Transcript: ${transcript ?? "No transcript provided"}
Candidate's Code/Written Response: ${codeResponse ?? "N/A"}
Interview Level: ${level}`;

  try {
    const raw = await callGeminiForRating(system, user);
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
      console.warn("[rateAnswer] Gemini unavailable; using fallback rating", {
        reason: err instanceof Error ? err.message : String(err),
        transcriptLength: transcript?.length ?? 0,
        codeLength: codeResponse?.length ?? 0,
      });
      return fallbackRating(level, questionText, category, expectedAnswerSummary, transcript, codeResponse);
    }
    throw err;
  }
}

export async function rateAnswersBatch(
  questions: BatchRatingInput[],
  level: string
): Promise<BatchRatingResult[]> {
  if (questions.length === 0) return [];

  const fallbackResults = () =>
    questions.map((question) => ({
      id: question.id,
      ...fallbackRating(
        level,
        question.questionText,
        question.category,
        question.expectedAnswerSummary,
        question.transcript,
        question.codeResponse,
        Boolean(question.hasVideo)
      ),
    }));

  const system = `You are a strict but fair technical interviewer evaluating multiple candidate responses.
Score each response from 0 to 10 based on accuracy, depth, clarity, and relevance to its question.
Reward complete, specific answers that address the expected answer summary even if wording differs.
If a candidate only repeats or paraphrases the question without answering, score 0.
Return ONLY valid JSON. No markdown, no preamble.
Format: [{ "id": "question-id", "score": number, "rationale": "2-3 sentence evaluation" }]`;

  const user = `Interview Level: ${level}
Questions and candidate responses:
${JSON.stringify(
  questions.map((question) => ({
    id: question.id,
    question: question.questionText,
    category: question.category,
    expectedAnswerSummary: question.expectedAnswerSummary,
    spokenTranscript: question.transcript ?? "No transcript provided",
    codeOrWrittenResponse: question.codeResponse ?? "N/A",
  })),
  null,
  2
)}`;

  try {
    const raw = await callGeminiForRating(system, user);
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(parsed)) return fallbackResults();

    const byId = new Map<string, Partial<BatchRatingResult>>();
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Partial<BatchRatingResult>;
      if (typeof candidate.id === "string") byId.set(candidate.id, candidate);
    }

    return questions.map((question) => {
      const parsedRating = byId.get(question.id);
      if (
        !parsedRating ||
        typeof parsedRating.score !== "number" ||
        typeof parsedRating.rationale !== "string"
      ) {
        return {
          id: question.id,
          ...fallbackRating(
            level,
            question.questionText,
            question.category,
            question.expectedAnswerSummary,
            question.transcript,
            question.codeResponse,
            Boolean(question.hasVideo)
          ),
        };
      }

      return {
        id: question.id,
        score: Math.max(0, Math.min(10, parsedRating.score)),
        rationale: parsedRating.rationale,
      };
    });
  } catch (err: unknown) {
    if (isGeminiConfigOrAuthError(err)) {
      console.warn("[rateAnswersBatch] Gemini unavailable; using fallback ratings", {
        reason: err instanceof Error ? err.message : String(err),
        questionCount: questions.length,
      });
      return fallbackResults();
    }
    throw err;
  }
}
