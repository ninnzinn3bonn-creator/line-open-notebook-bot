import "dotenv/config";
import { createApp } from "./app.js";
import { initializeDatabase } from "./db/database.js";
import { JobQueue } from "./db/queue.js";
import { startWorkers } from "./jobs/worker.js";
import { HttpLineClient } from "./line/client.js";
import { MockAnswerProvider } from "./providers/mock-answer-provider.js";
import { TimeoutAnswerProvider } from "./providers/timeout-answer-provider.js";
import { AnswerPolicyProvider } from "./providers/answer-policy-provider.js";
import { OpenNotebookProvider } from "./providers/open-notebook-provider.js";

const port = Number(process.env.BRIDGE_PORT ?? 3001);
const providerName = process.env.ANSWER_PROVIDER ?? "mock";
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

const provider = new AnswerPolicyProvider(
  new TimeoutAnswerProvider(
    rawProvider,
    Number(process.env.AI_TIMEOUT_MS ?? 30_000)
  )
);
const database = initializeDatabase(process.env.SQLITE_PATH ?? "./data/queue.db");
const queue = new JobQueue(database);
const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
if (accessToken) {
  startWorkers(queue, provider, new HttpLineClient(accessToken, Number(process.env.LINE_SEND_TIMEOUT_MS ?? 10_000)), {
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
    pollMs: Number(process.env.WORKER_POLL_MS ?? 250),
    leaseMs: Number(process.env.WORKER_LEASE_MS ?? 120_000),
    maxRetries: Number(process.env.MAX_RETRIES ?? 2),
    retryDelayMs: Number(process.env.RETRY_DELAY_MS ?? 2_000),
    replyCutoffMs: Number(process.env.LINE_REPLY_CUTOFF_MS ?? 45_000),
    emergencyAnswerText: process.env.EMERGENCY_ANSWER_TEXT ?? "申し訳ございません。ただいま回答を取得できませんでした。お急ぎの場合は店舗へ直接お問い合わせいただくか、時間をおいてもう一度お試しください。"
  });
}

const server = createApp({ provider, queue, lineChannelSecret: process.env.LINE_CHANNEL_SECRET }).listen(port, "0.0.0.0", () => {
  console.log(`Bridge listening at http://0.0.0.0:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => database.close()));
}
