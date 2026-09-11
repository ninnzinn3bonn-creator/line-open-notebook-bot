import type { AnswerProvider } from "../providers/answer-provider.js";
import { JobQueue } from "../db/queue.js";
import type { LineClient } from "../line/client.js";
import { LineApiError } from "../line/client.js";

export type WorkerOptions = {
  concurrency: number;
  pollMs: number;
  leaseMs: number;
  maxRetries: number;
  retryDelayMs: number;
  replyCutoffMs: number;
  emergencyAnswerText: string;
};

export function startWorkers(queue: JobQueue, provider: AnswerProvider, line: LineClient, options: WorkerOptions): () => void {
  let stopped = false;
  const loops = Array.from({ length: options.concurrency }, async () => {
    while (!stopped) {
      if (!(await processNextJob(queue, provider, line, options))) {
        await wait(options.pollMs);
      }
    }
  });
  void Promise.allSettled(loops);
  return () => { stopped = true; };
}

export async function processNextJob(
  queue: JobQueue,
  provider: AnswerProvider,
  line: LineClient,
  options: WorkerOptions
): Promise<boolean> {
  const job = queue.claimNext(options.leaseMs);
  if (!job) return false;

  let answer = job.answerText;
  let emergencyAnswerUsed = false;
  if (!answer) {
    try {
      answer = (await provider.answer({ message: job.message, userId: job.userId })).text;
      queue.saveAnswer(job.id, answer);
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (job.attempts <= options.maxRetries) {
        queue.retryOrFail(job.id, job.attempts, options.maxRetries, detail, options.retryDelayMs);
        return true;
      }
      answer = options.emergencyAnswerText;
      emergencyAnswerUsed = true;
      queue.saveFallbackAnswer(job.id, answer, detail);
    }
  }

  try {
    const replyIsUsable = Boolean(job.replyToken) && Date.now() - Date.parse(job.receivedAt) < options.replyCutoffMs;
    const mode = replyIsUsable ? "reply" : "push";
    const retryKey = queue.beginSend(job.id, mode);
    if (mode === "reply") await line.reply(job.replyToken!, answer);
    else await line.push(job.userId, answer, retryKey!);
    queue.markSucceeded(job.id, emergencyAnswerUsed);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (error instanceof LineApiError && error.outcomeUnknown) {
      queue.markUnknown(job.id, detail);
    } else {
      const allowedRetries = error instanceof LineApiError && !error.retryable ? -1 : options.maxRetries;
      queue.retryOrFail(job.id, job.attempts, allowedRetries, detail, options.retryDelayMs);
    }
  }
  return true;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
