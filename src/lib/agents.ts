import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// Haiku for the cheap word-count estimate; Sonnet for curriculum judgement, quizzes and marking.
const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";

const client = new Anthropic();

export class AgentError extends Error {}

/** Sonnet call with structured JSON output and server-side refusal fallback. */
async function sonnet<T extends z.ZodType>(
  schema: T,
  system: string,
  prompt: string,
  effort: "low" | "medium" | "high" = "medium",
): Promise<z.infer<T>> {
  const response = await client.beta.messages.parse({
    model: SONNET,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort, format: betaZodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") throw new AgentError("The model declined this request.");
  if (!response.parsed_output) throw new AgentError(`No structured output (stop_reason: ${response.stop_reason}).`);
  return response.parsed_output as z.infer<T>;
}

// ---------- 1. Word count (Haiku) ----------

const WordEstimate = z.object({
  recognised: z.boolean().describe("true if you know this specific book"),
  estimated_words: z.number().int().describe("best estimate of total words in the book"),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().describe("one short sentence, e.g. which edition or why the estimate is uncertain"),
});
export type WordEstimate = z.infer<typeof WordEstimate>;

export async function estimateWords(title: string, author: string | null): Promise<WordEstimate> {
  const response = await client.messages.parse({
    model: HAIKU,
    max_tokens: 2000,
    system:
      "You estimate how many words are in children's books. Use what you know about the book " +
      "(page count, typical words per page for its format, published word counts). Picture books are " +
      "usually 300–1,000 words, early readers 1,000–5,000, early chapter books 5,000–20,000, " +
      "middle-grade novels 20,000–60,000. If you don't recognise the book, give a cautious estimate " +
      "for a typical book with that kind of title for a 7-year-old and set confidence to low.",
    messages: [{ role: "user", content: `Title: ${title}\nAuthor: ${author || "unknown"}` }],
    output_config: { effort: "low", format: zodOutputFormat(WordEstimate) },
  });
  if (!response.parsed_output) throw new AgentError("Could not estimate the word count.");
  const out = response.parsed_output;
  return { ...out, estimated_words: Math.max(0, Math.round(out.estimated_words)) };
}

// ---------- 2. Curriculum methodology + level scoring (Sonnet) ----------

export const Rubric = z.object({
  summary: z.string().describe("2-3 sentence plain-English explanation for a parent"),
  bands: z
    .array(
      z.object({
        id: z.string().describe("short slug, e.g. 'y2-early-chapter'"),
        name: z.string(),
        order: z.number().int().describe("1 = easiest"),
        year_groups: z.string().describe("e.g. 'Year 1-2'"),
        curriculum_link: z.string().describe("which National Curriculum reading expectations this band reflects"),
        typical_features: z.string(),
        example_books: z.array(z.string()),
      }),
    )
    .describe("6-8 difficulty bands from phonics readers up to confident Year 4 novels"),
  scoring_rules: z.object({
    same_band: z.number().describe("points for a book in the same band as his recent reading (small, near 0)"),
    one_band_up: z.number(),
    two_or_more_bands_up: z.number(),
    lower_band: z.number().describe("points for an easier book (0 or tiny; never punish enjoyment)"),
    breadth_bonus: z.number().describe("extra points for a new genre/non-fiction at a similar level"),
  }),
  notes: z.array(z.string()),
});
export type Rubric = z.infer<typeof Rubric>;

export function generateMethodology(): Promise<Rubric> {
  return sonnet(
    Rubric,
    "You are a UK primary-school literacy specialist who knows the National Curriculum in England: " +
      "English programmes of study for Key Stages 1 and 2 (word reading and comprehension), and common " +
      "book-banding practice in English schools.",
    "Design a simple, transparent methodology to track the reading ability of a 7-year-old (Year 2/3) " +
      "in England from the books he reads. Define difficulty bands tied to the curriculum, and a points " +
      "system where reading books at a similar level keeps his score roughly flat, stepping up to harder " +
      "books raises it, and easier books never reduce it. Points per book should be in the range 0-10.",
    "high",
  );
}

const LevelAssessment = z.object({
  band_id: z.string(),
  band_name: z.string(),
  rationale: z.string().describe("one or two sentences a parent can read"),
  score_delta: z.number().describe("points earned per the rubric's scoring rules"),
});
export type LevelAssessment = z.infer<typeof LevelAssessment>;

export function assessLevel(
  rubric: Rubric,
  book: { title: string; author: string | null; words: number },
  recent: { title: string; band_name: string | null }[],
): Promise<LevelAssessment> {
  const history = recent.length
    ? recent.map((b) => `- ${b.title} (${b.band_name ?? "unbanded"})`).join("\n")
    : "(none yet: this is his first book; treat the band of this book as his baseline and score it as same_band)";
  return sonnet(
    LevelAssessment,
    "You apply a fixed reading methodology consistently. Use only the bands and scoring rules given.",
    `Methodology:\n${JSON.stringify(rubric)}\n\nHis most recent books (newest first):\n${history}\n\n` +
      `New book: "${book.title}" by ${book.author || "unknown author"}, about ${book.words} words.\n` +
      "Place the new book in a band and compute score_delta by comparing it with his recent typical band.",
    "low",
  );
}

// ---------- 3. Quiz (Sonnet) ----------

const QuizQuestion = z.object({
  id: z.number().int(),
  kind: z.enum(["multiple_choice", "free_text"]),
  skill: z.enum(["retrieval", "vocabulary", "inference", "prediction", "reasoning", "summarising"]),
  question: z.string(),
  options: z.array(z.string()).describe("3 or 4 options for multiple_choice; empty array for free_text"),
  correct_index: z.number().int().describe("index into options; -1 for free_text"),
  model_answer: z.string().describe("short ideal answer, used to mark free_text"),
});
const Quiz = z.object({ questions: z.array(QuizQuestion) });
export type QuizQuestion = z.infer<typeof QuizQuestion>;

export async function generateQuiz(book: { title: string; author: string | null; band_name: string | null }) {
  const quiz = await sonnet(
    Quiz,
    "You write gentle, encouraging reading-comprehension quizzes for a 7-year-old in England, in the style " +
      "of KS1/KS2 reading content domains (retrieval, vocabulary, inference, prediction, explaining, summarising). " +
      "Use short sentences and simple words. Questions must be about the actual events, characters and words of " +
      "the book, so that only a child who read it can answer confidently. Never ask about content you are unsure of.",
    `Book: "${book.title}" by ${book.author || "unknown author"} (level: ${book.band_name ?? "unknown"}).\n` +
      "Write exactly 10 questions, ids 1-10: 7 multiple_choice (3-4 options, one clearly right) followed by " +
      "3 free_text questions that ask him to explain why, or say what he thinks, in a sentence. Mix the skills, " +
      "with at least 3 inference/reasoning questions. Vary the position of the correct option.",
    "medium",
  );
  if (quiz.questions.length !== 10) throw new AgentError("The quiz didn't come back with 10 questions.");
  return quiz.questions.map((q, i) => ({ ...q, id: i + 1 }));
}

// ---------- 4. Tricky words + sentence judging (Sonnet) ----------

const Vocabulary = z.object({
  words: z
    .array(
      z.object({
        word: z.string().describe("the word as it appears in the book, lower case unless a proper noun"),
        meaning: z.string().describe("a child-friendly meaning in under 12 simple words"),
        example: z.string().describe("a short simple sentence showing how the word is used, ideally from the story"),
      }),
    )
    .describe("exactly 3 words"),
});

export async function pickVocabulary(book: { title: string; author: string | null; band_name: string | null }) {
  const out = await sonnet(
    Vocabulary,
    "You are a UK primary teacher choosing vocabulary to teach a 7-year-old (Year 2/3) from a book he has read. " +
      "Pick ambitious but useful words (National Curriculum: 'discussing word meanings, linking new meanings to " +
      "those already known'). Choose words that genuinely appear in this book, that he probably doesn't use yet, " +
      "and that he could use in his own sentences. Avoid made-up words, names, rude words and very rare words.",
    `Book: "${book.title}" by ${book.author || "unknown author"} (level: ${book.band_name ?? "unknown"}).\n` +
      "Choose exactly 3 tricky words from this book.",
    "low",
  );
  const words = out.words.slice(0, 3);
  if (words.length !== 3) throw new AgentError("Couldn't pick 3 tricky words.");
  return words;
}

export const SentenceJudgement = z.object({
  results: z.array(
    z.object({
      word: z.string(),
      used_word_correctly: z.boolean().describe("true if the word is used with a sensible meaning (spelling may be off)"),
      level: z.enum(["not_yet", "year1", "year2", "year3", "year4_plus"]),
      strengths: z.string().describe("one short, specific, kind sentence to the child about what he did well"),
      next_step: z.string().describe("one short tip for next time, written to the child"),
    }),
  ),
});
export type SentenceJudgement = z.infer<typeof SentenceJudgement>["results"][number];

export async function judgeSentences(items: { word: string; meaning: string; sentence: string }[]) {
  if (!items.length) return [];
  const out = await sonnet(
    SentenceJudgement,
    "You assess a 7-year-old's sentences against the National Curriculum in England writing expectations " +
      "(English programmes of study and Appendix 2: vocabulary, grammar and punctuation).\n" +
      "Levels:\n" +
      "- not_yet: not a sentence, blank, or doesn't make sense.\n" +
      "- year1: simple sentence joined with 'and'; may lack capital letter or full stop.\n" +
      "- year2: capital letter and full stop; may use expanded noun phrases (e.g. 'the huge, hungry fox'), " +
      "subordination with when/if/that/because, or co-ordination with or/and/but.\n" +
      "- year3: wider range of conjunctions (while, before, after, so, although), prepositions or adverbs " +
      "for time and cause, inverted commas for speech, or a clear, precise vocabulary choice.\n" +
      "- year4_plus: fronted adverbials with a comma, well-chosen nouns/pronouns for clarity, multi-clause " +
      "sentences that read fluently.\n" +
      "Judge grammar, punctuation and vocabulary choice; ignore spelling mistakes except in the target word's " +
      "meaning. Be warm and encouraging; he is 7.",
    items.map((i) => `Word: ${i.word} (means: ${i.meaning})\nHis sentence: ${i.sentence || "(blank)"}`).join("\n\n"),
    "low",
  );
  return out.results;
}

const Marking = z.object({
  results: z.array(z.object({ id: z.number().int(), correct: z.boolean(), feedback: z.string() })),
});

export async function markFreeText(
  book: { title: string },
  items: { id: number; question: string; model_answer: string; answer: string }[],
) {
  if (!items.length) return [];
  const out = await sonnet(
    Marking,
    "You mark a 7-year-old's typed answers. Be generous: ignore spelling, grammar and length. Mark correct if " +
      "the answer shows he understood the idea, even partly. Mark wrong if it is blank, off-topic, or contradicts " +
      "the book. Feedback is one short, kind sentence written to him.",
    `Book: "${book.title}"\n\n` +
      items
        .map((i) => `Question ${i.id}: ${i.question}\nIdeal answer: ${i.model_answer}\nHis answer: ${i.answer || "(blank)"}`)
        .join("\n\n"),
    "low",
  );
  return out.results;
}
