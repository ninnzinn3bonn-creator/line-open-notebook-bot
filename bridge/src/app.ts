import express from "express";
import type { AnswerProvider } from "./providers/answer-provider.js";
import type { JobQueue } from "./db/queue.js";
import { extractTextEvents, type LineWebhookBody } from "./line/events.js";
import { verifyLineSignature } from "./line/signature.js";
import type { ReviewDecision, ReviewQueue } from "./db/review-queue.js";
import { timingSafeEqual } from "node:crypto";

export type AppDependencies = {
  provider: AnswerProvider;
  queue?: JobQueue;
  lineChannelSecret?: string;
  reviewQueue?: ReviewQueue;
  internalAdminToken?: string;
};

export function createApp({ provider, queue, lineChannelSecret = "", reviewQueue, internalAdminToken = "" }: AppDependencies) {
  const app = express();

  app.post("/webhooks/line", express.raw({ type: "application/json", limit: "1mb" }), (request, response) => {
    if (!queue || !verifyLineSignature(request.body as Buffer, request.header("x-line-signature"), lineChannelSecret)) {
      response.sendStatus(401);
      return;
    }
    try {
      const body = JSON.parse((request.body as Buffer).toString("utf8")) as LineWebhookBody;
      for (const event of extractTextEvents(body)) {
        queue.enqueue({
          webhookEventId: event.webhookEventId,
          userId: event.userId,
          replyToken: event.replyToken,
          receivedAt: new Date(event.timestamp).toISOString(),
          payloadJson: JSON.stringify(event.raw)
        }, event.message);
      }
      response.sendStatus(200);
    } catch {
      response.sendStatus(400);
    }
  });

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", answerProvider: process.env.ANSWER_PROVIDER ?? "mock" });
  });

  app.post("/internal/answer", async (request, response, next) => {
    try {
      const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
      const userId = typeof request.body?.userId === "string" ? request.body.userId.trim() : "";
      if (!message || !userId) {
        response.status(400).json({ error: "message and userId are required" });
        return;
      }
      response.json(await provider.answer({ message, userId }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/internal/reviews", (request, response) => {
    if (!reviewQueue || !authorized(request.header("authorization"), internalAdminToken)) {
      response.sendStatus(reviewQueue ? 401 : 503);
      return;
    }
    const status = request.query.status === "resolved" ? "resolved" : "pending";
    const limit = Number(request.query.limit ?? 50);
    response.json({ status, reviews: reviewQueue.list(status, Number.isFinite(limit) ? limit : 50) });
  });

  app.post("/internal/reviews/:id/decision", (request, response) => {
    if (!reviewQueue || !authorized(request.header("authorization"), internalAdminToken)) {
      response.sendStatus(reviewQueue ? 401 : 503);
      return;
    }
    const id = Number(request.params.id);
    const decision = request.body?.decision as ReviewDecision | undefined;
    const note = typeof request.body?.note === "string" ? request.body.note : undefined;
    if (!Number.isInteger(id) || id < 1 || !decision || !["in_scope", "out_of_scope", "knowledge_missing"].includes(decision)) {
      response.status(400).json({ error: "valid id and decision are required" });
      return;
    }
    if (!reviewQueue.resolve(id, decision, note)) {
      response.status(409).json({ error: "review is missing or already resolved" });
      return;
    }
    response.json({ id, status: "resolved", decision });
  });

  return app;
}

function authorized(header: string | undefined, expectedToken: string): boolean {
  if (!expectedToken || !header?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
