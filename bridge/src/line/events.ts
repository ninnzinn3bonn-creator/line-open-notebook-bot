export type LineWebhookBody = { events?: unknown[] };

export type TextLineEvent = {
  webhookEventId: string;
  userId: string;
  replyToken?: string;
  timestamp: number;
  message: string;
  raw: unknown;
};

export function extractTextEvents(body: LineWebhookBody): TextLineEvent[] {
  if (!Array.isArray(body.events)) return [];
  const result: TextLineEvent[] = [];
  for (const raw of body.events) {
    if (!raw || typeof raw !== "object") continue;
    const event = raw as Record<string, unknown>;
    const source = event.source as Record<string, unknown> | undefined;
    const message = event.message as Record<string, unknown> | undefined;
    if (event.type !== "message" || message?.type !== "text" || source?.type !== "user") continue;
    if (typeof event.webhookEventId !== "string" || typeof source.userId !== "string" || typeof message.text !== "string") continue;
    result.push({
      webhookEventId: event.webhookEventId,
      userId: source.userId,
      replyToken: typeof event.replyToken === "string" ? event.replyToken : undefined,
      timestamp: typeof event.timestamp === "number" ? event.timestamp : Date.now(),
      message: message.text,
      raw
    });
  }
  return result;
}
