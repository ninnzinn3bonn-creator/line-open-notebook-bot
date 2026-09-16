import "dotenv/config";
import { createApp } from "./app.js";
import { initializeDatabase } from "./db/database.js";
import { JobQueue } from "./db/queue.js";
import { startWorkers } from "./jobs/worker.js";
import { HttpLineClient, parseQuickReplies } from "./line/client.js";
import { MockAnswerProvider } from "./providers/mock-answer-provider.js";
import { TimeoutAnswerProvider } from "./providers/timeout-answer-provider.js";
import { AnswerPolicyProvider } from "./providers/answer-policy-provider.js";
import { OpenNotebookProvider } from "./providers/open-notebook-provider.js";
import { GroundedAnswerProvider } from "./providers/grounded-answer-provider.js";
import { ReviewQueue } from "./db/review-queue.js";
import { ConversationStore } from "./db/conversation-store.js";
import { ConversationMemoryProvider } from "./providers/conversation-memory-provider.js";
import { HandoffQueue } from "./db/handoff-queue.js";
import { HumanHandoffProvider } from "./providers/human-handoff-provider.js";

const port = Number(process.env.BRIDGE_PORT ?? 3001);
const providerName = process.env.ANSWER_PROVIDER ?? "mock";
const database = initializeDatabase(process.env.SQLITE_PATH ?? "./data/queue.db");
const queue = new JobQueue(database);
const reviewQueue = new ReviewQueue(database);
const conversationStore = new ConversationStore(database, Number(process.env.CONVERSATION_MAX_RALLIES ?? 3));
const handoffQueue = new HandoffQueue(database);
const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when ANSWER_PROVIDER=open-notebook`);
  return value;
};

const rawProvider = providerName === "mock"
  ? new MockAnswerProvider(Number(process.env.MOCK_ANSWER_DELAY_MS ?? 10))
  : providerName === "open-notebook"
    ? new OpenNotebookProvider({
        baseUrl: required("OPEN_NOTEBOOK_BASE_URL"),
        strategyModelId: required("OPEN_NOTEBOOK_STRATEGY_MODEL_ID"),
        answerModelId: required("OPEN_NOTEBOOK_ANSWER_MODEL_ID"),
        finalAnswerModelId: required("OPEN_NOTEBOOK_FINAL_MODEL_ID")
      })
    : (() => { throw new Error(`Unsupported ANSWER_PROVIDER=${providerName}`); })();

const policyProvider = new AnswerPolicyProvider(rawProvider);
const routedProvider = providerName === "open-notebook"
  ? new GroundedAnswerProvider(policyProvider, {
      baseUrl: required("OPEN_NOTEBOOK_BASE_URL"),
      answerThreshold: Number(process.env.GROUNDING_ANSWER_THRESHOLD ?? 0.70),
      outOfScopeThreshold: Number(process.env.GROUNDING_OUT_OF_SCOPE_THRESHOLD ?? 0.60),
      reviewQueue,
      outOfScopeText: process.env.OUT_OF_SCOPE_ANSWER_TEXT ?? "恐れ入りますが、こちらでは店舗に関するお問い合わせを承っています。店舗について確認したいことがございましたら、内容をお聞かせください。",
      reviewText: process.env.REVIEW_PENDING_ANSWER_TEXT ?? "お問い合わせありがとうございます。恐れ入りますが、そちらの内容は現在このLINEではご案内できません。店舗に関するほかのご質問がございましたら、お尋ねください。"
    })
  : policyProvider;
const provider = new ConversationMemoryProvider(
  new TimeoutAnswerProvider(new HumanHandoffProvider(routedProvider, {
    queue: handoffQueue,
    answerText: process.env.HUMAN_HANDOFF_ANSWER_TEXT ?? "お問い合わせありがとうございます。担当者による確認が必要な内容です。恐れ入りますが、店舗へ直接お問い合わせください。",
    phone: process.env.HUMAN_HANDOFF_PHONE,
    hours: process.env.HUMAN_HANDOFF_HOURS,
    chatUrl: process.env.HUMAN_HANDOFF_CHAT_URL
  }), Number(process.env.AI_TIMEOUT_MS ?? 30_000)),
  conversationStore
);
const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
const defaultQuickReplies = "営業時間::営業時間を教えてください|アクセス::お店へのアクセスを教えてください|予約について::予約について教えてください|担当者に相談::担当者に相談したいです";
if (accessToken) {
  startWorkers(queue, provider, new HttpLineClient(
    accessToken,
    Number(process.env.LINE_SEND_TIMEOUT_MS ?? 10_000),
    parseQuickReplies(process.env.LINE_QUICK_REPLIES ?? defaultQuickReplies)
  ), {
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
    pollMs: Number(process.env.WORKER_POLL_MS ?? 250),
    leaseMs: Number(process.env.WORKER_LEASE_MS ?? 120_000),
    maxRetries: Number(process.env.MAX_RETRIES ?? 2),
    retryDelayMs: Number(process.env.RETRY_DELAY_MS ?? 2_000),
    replyCutoffMs: Number(process.env.LINE_REPLY_CUTOFF_MS ?? 45_000),
    emergencyAnswerText: process.env.EMERGENCY_ANSWER_TEXT ?? "申し訳ございません。ただいま回答を取得できませんでした。お急ぎの場合は店舗へ直接お問い合わせいただくか、時間をおいてもう一度お試しください。"
  });
}

const server = createApp({
  provider,
  queue,
  reviewQueue,
  handoffQueue,
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET,
  internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN
}).listen(port, "0.0.0.0", () => {
  console.log(`Bridge listening at http://0.0.0.0:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => database.close()));
}
