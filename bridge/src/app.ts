import express from "express";
import type { AnswerProvider } from "./providers/answer-provider.js";
import type { JobQueue } from "./db/queue.js";
import { extractTextEvents, type LineWebhookBody } from "./line/events.js";
import { verifyLineSignature } from "./line/signature.js";

export type AppDependencies = {
  provider: AnswerProvider;
  queue?: JobQueue;
  lineChannelSecret?: string;
};

export function createApp({ provider, queue, lineChannelSecret = "" }: AppDependencies) {
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

  return app;
}
