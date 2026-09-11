export class LineApiError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly outcomeUnknown: boolean) {
    super(message);
  }
}

export interface LineClient {
  reply(replyToken: string, text: string): Promise<void>;
  push(userId: string, text: string, retryKey: string): Promise<void>;
}

export class HttpLineClient implements LineClient {
  constructor(private readonly accessToken: string, private readonly timeoutMs = 10_000) {}

  reply(replyToken: string, text: string) {
    return this.send("https://api.line.me/v2/bot/message/reply", { replyToken, messages: textMessages(text) });
  }

  push(userId: string, text: string, retryKey: string) {
    return this.send("https://api.line.me/v2/bot/message/push", { to: userId, messages: textMessages(text) }, retryKey);
  }

  private async send(url: string, body: unknown, retryKey?: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          "content-type": "application/json",
          ...(retryKey ? { "x-line-retry-key": retryKey } : {})
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new LineApiError(`LINE ${response.status}: ${detail}`, response.status === 429 || response.status >= 500, false);
      }
    } catch (error) {
      if (error instanceof LineApiError) throw error;
      throw new LineApiError(error instanceof Error ? error.message : String(error), true, true);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function textMessages(text: string): Array<{ type: "text"; text: string }> {
  const characters = Array.from(text.trim() || "回答を生成できませんでした。");
  const messages: Array<{ type: "text"; text: string }> = [];
  for (let offset = 0; offset < characters.length && messages.length < 5; offset += 5000) {
    messages.push({ type: "text", text: characters.slice(offset, offset + 5000).join("") });
  }
  return messages;
}
