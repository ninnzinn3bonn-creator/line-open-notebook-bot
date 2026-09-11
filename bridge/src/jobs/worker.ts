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
};

export function startWorkers(queue: JobQueue, provider: AnswerProvider, line: LineClient, options: WorkerOptions): () => void {
  let stopped = false;
  const loops = Array.from({ length: options.concurrency }, async () => {
    while (!stopped) {
      const job = queue.claimNext(options.leaseMs);
      if (!job) {
        await wait(options.pollMs);
        continue;
      }
      try {
        const answer = job.answerText ?? (await provider.answer({ message: job.message, userId: job.userId })).text;
        if (!job.answerText) queue.saveAnswer(job.id, answer);
        const replyIsUsable = Boolean(job.replyToken) && Date.now() - Date.parse(job.receivedAt) < options.replyCutoffMs;
        const mode = replyIsUsable ? "reply" : "push";
        const retryKey = queue.beginSend(job.id, mode);
        if (mode === "reply") await line.reply(job.replyToken!, answer);
        else await line.push(job.userId, answer, retryKey!);
        queue.markSucceeded(job.id);
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        if (error instanceof LineApiError && error.outcomeUnknown) {
          queue.markUnknown(job.id, detail);
        } else {
          const allowedRetries = error instanceof LineApiError && !error.retryable ? -1 : options.maxRetries;
          queue.retryOrFail(job.id, job.attempts, allowedRetries, detail, options.retryDelayMs);
        }
      }
    }
  });
  void Promise.allSettled(loops);
  return () => { stopped = true; };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
