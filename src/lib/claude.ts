import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import pRetry from "p-retry";

const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = 15000;
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 15000;

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
]);

const DOMAIN_PHRASES = [
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

type AiProvider = "OpenAI" | "Gemini";

interface AiProviderResponse {
  provider: AiProvider;
  text: string;
}

function getOpenAIApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  if (key.includes("...")) return null;
  if (key.toLowerCase().includes("your-")) return null;
  if (key.toLowerCase().includes("replace")) return null;

  return key;
}

function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  // Common placeholder forms from docs/examples.
  if (key.includes("...")) return null;
  if (key.toLowerCase().includes("your-")) return null;
  if (key.toLowerCase().includes("replace")) return null;

  return key;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function callOpenAI(system: string, user: string): Promise<string> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) throw new Error("OPENAI_NOT_CONFIGURED");

  const client = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS });

  return pRetry(
    async () => {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        instructions: system,
        input: user,
      });
      const text = response.output_text?.trim();
      if (!text) throw new Error("OPENAI_EMPTY_RESPONSE");
      return text;
    },
    { retries: 1, minTimeout: 500, factor: 2 }
  );
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
      const result = await model.generateContent(user, { timeout: GEMINI_TIMEOUT_MS });
      return result.response.text();
    },
    { retries: 1, minTimeout: 500, factor: 2 }
  );
}

async function callAI(system: string, user: string): Promise<AiProviderResponse> {
  let openAIError: unknown = null;

  try {
    return { provider: "OpenAI", text: await callOpenAI(system, user) };
  } catch (err: unknown) {
    openAIError = err;
    if (getOpenAIApiKey()) {
      console.warn("[callAI] OpenAI unavailable; trying Gemini fallback", { reason: errorMessage(err) });
    }
  }

  try {
    return { provider: "Gemini", text: await callGemini(system, user) };
  } catch (geminiError: unknown) {
    throw new Error(
      `AI_PROVIDER_UNAVAILABLE: OpenAI: ${errorMessage(openAIError)} | Gemini: ${errorMessage(geminiError)}`
    );
  }
}

async function callAIWithPreferredProvider(
  system: string,
  user: string,
  preferredProvider: AiProvider
): Promise<AiProviderResponse> {
  if (preferredProvider === "OpenAI") {
    return callAI(system, user);
  }

  let geminiError: unknown = null;

  try {
    return { provider: "Gemini", text: await callGemini(system, user) };
  } catch (err: unknown) {
    geminiError = err;
    if (getGeminiApiKey()) {
      console.warn("[callAI] Gemini unavailable; trying OpenAI fallback", { reason: errorMessage(err) });
    }
  }

  try {
    return { provider: "OpenAI", text: await callOpenAI(system, user) };
  } catch (openAIError: unknown) {
    throw new Error(
      `AI_PROVIDER_UNAVAILABLE: Gemini: ${errorMessage(geminiError)} | OpenAI: ${errorMessage(openAIError)}`
    );
  }
}

function isAIProviderUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("ai_provider_unavailable") ||
    message.includes("openai_not_configured") ||
    message.includes("gemini_not_configured") ||
    message.includes("api key") ||
    message.includes("401") ||
    message.includes("403") ||
    message.includes("404") ||
    message.includes("429") ||
    message.includes("not found") ||
    message.includes("not supported") ||
    message.includes("aborted") ||
    message.includes("timeout") ||
    message.includes("rate limit") ||
    message.includes("permission_denied") ||
    message.includes("unregistered callers") ||
    message.includes("googlegenerativeai error") ||
    message.includes("openai")
  );
}

function extractKeywords(jobDescription: string): string[] {
  const text = jobDescription.toLowerCase();
  const phraseMatches = DOMAIN_PHRASES.filter((phrase) => text.includes(phrase));
  const tokens = text.match(/[a-z0-9+#./-]{2,}/g) ?? [];
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const phrase of phraseMatches) {
    seen.add(phrase);
    keywords.push(phrase);
  }

  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    keywords.push(token);
    if (keywords.length >= 12) break;
  }

  if (keywords.length === 0) {
    if (jobDescription.toLowerCase().includes("healthcare")) {
      keywords.push("healthcare requirements", "claims workflows", "test case design", "stakeholder communication");
    } else {
      keywords.push("solution design", "testing strategy", "debugging approach", "performance analysis");
    }
  }

  return keywords;
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
      if (variantIndex === 1) return `What are the most important fundamentals behind ${topic}, and where do candidates commonly misunderstand them?`;
      if (variantIndex === 2) return `Walk through a real example that demonstrates ${topic}, including the assumptions and limits of your approach.`;
      return `Explain the core concepts behind ${topic} and how they matter for this position.`;
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
      if (variantIndex === 2) return `Describe the most relevant experience you have with ${topic}, including your role, constraints, and result.`;
      return `Describe a past project where you used ${topic} or a similar skill. What did you personally own, improve, or document?`;
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
      if (variantIndex === 1) return `Create a test strategy for ${topic}. What positive, negative, and regression cases would you include?`;
      if (variantIndex === 2) return `How would you prove that a change involving ${topic} is ready for release or stakeholder sign-off?`;
      return `How would you test a change involving ${topic}, including edge cases, regression coverage, and acceptance criteria?`;
    case "communication":
      if (variantIndex === 1) return `How would you brief a non-technical stakeholder on progress, risks, and decisions related to ${topic}?`;
      if (variantIndex === 2) return `When explaining ${topic}, how would you adapt your message for teammates, managers, and business users?`;
      return `Explain ${topic} ${seniority} to a teammate or stakeholder who needs to understand risks, trade-offs, and next steps.`;
    default:
      return `How would you apply ${topic} for the responsibilities described in the JD?`;
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

  return Array.from({ length: 10 }, (_, idx) => {
    const id = idx + 1;
    const category = categories[idx];
    let topic = keywords[idx % keywords.length];
    let questionText = "";

    for (let attempt = 0; attempt < keywords.length * 3; attempt += 1) {
      topic = keywords[(idx + attempt) % keywords.length];
      const secondaryTopic = keywords[(idx + attempt + 3) % keywords.length] ?? "the JD requirements";
      const candidate = buildFallbackQuestion(level, topic, secondaryTopic, category, Math.floor(attempt / keywords.length));
      if (!isTooSimilarToAny(candidate, usedQuestions)) {
        questionText = candidate;
        break;
      }
      if (!questionText) questionText = candidate;
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
    const questionText = isTooSimilarToAny(cleanedQuestion, usedQuestions)
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
- Avoid generic filler questions when the JD provides specific responsibilities or tools.`;

  const userPrompt = `Interview Level: ${level}
Job Description: ${jobDescription}
Candidate Resume Context: intentionally excluded. Generate from the JD only.
Previous Questions To Avoid:
${previousQuestionsText}`;

  try {
    const aiResponse = await callAI(systemPrompt, userPrompt);
    const rawResponse = aiResponse.text;
    const cleaned = rawResponse.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const questions = normalizeQuestions(parsed, level, jobDescription, avoidQuestions);

    return {
      questions,
      debug: { systemPrompt, userPrompt, rawResponse: `[${aiResponse.provider}]\n${rawResponse}` },
    };
  } catch (err: unknown) {
    if (!isAIProviderUnavailableError(err)) {
      throw err;
    }

    const questions = fallbackQuestions(level, jobDescription, avoidQuestions);
    const reason = err instanceof Error ? err.message : "AI provider unavailable";

    return {
      questions,
      debug: {
        systemPrompt,
        userPrompt,
        rawResponse: `Fallback question generation used because AI providers were unavailable.\nReason: ${reason}`,
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

  if (isQuestionEcho(answer, questionText)) {
    return {
      score: 0,
      rationale:
        "Fallback scoring used because the AI provider is unavailable. The captured response appears to repeat the interview question rather than answer it, so this needs manual recruiter review.",
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
    const { text: raw } = await callAIWithPreferredProvider(system, user, "Gemini");
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
    if (isAIProviderUnavailableError(err)) {
      console.warn("[rateAnswer] AI provider unavailable; using fallback rating", {
        reason: err instanceof Error ? err.message : String(err),
        transcriptLength: transcript?.length ?? 0,
        codeLength: codeResponse?.length ?? 0,
      });
      return fallbackRating(level, questionText, category, expectedAnswerSummary, transcript, codeResponse);
    }
    throw err;
  }
}
