import express from "express";
import type { AnswerProvider } from "./providers/answer-provider.js";

export function createApp(provider: AnswerProvider) {
  const app = express();
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

