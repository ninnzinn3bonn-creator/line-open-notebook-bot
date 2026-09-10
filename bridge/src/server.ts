import "dotenv/config";
import { createApp } from "./app.js";
import { MockAnswerProvider } from "./providers/mock-answer-provider.js";

const port = Number(process.env.BRIDGE_PORT ?? 3001);
const providerName = process.env.ANSWER_PROVIDER ?? "mock";
if (providerName !== "mock") {
  throw new Error(`ANSWER_PROVIDER=${providerName} is not implemented yet`);
}

const provider = new MockAnswerProvider(Number(process.env.MOCK_ANSWER_DELAY_MS ?? 10));
createApp(provider).listen(port, "127.0.0.1", () => {
  console.log(`Bridge listening at http://127.0.0.1:${port}`);
});

