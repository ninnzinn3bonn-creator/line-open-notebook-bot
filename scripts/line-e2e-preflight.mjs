import "dotenv/config";
import { createHmac } from "node:crypto";

const secret = process.env.LINE_CHANNEL_SECRET?.trim() ?? "";
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? "";
const explicitBaseUrl = process.env.LINE_WEBHOOK_BASE_URL?.trim();
const publicHost = process.env.PUBLIC_HOST?.trim();
const baseUrl = (explicitBaseUrl || (publicHost && publicHost !== "notebook.example.com" ? `https://${publicHost}` : ""))
  .replace(/\/$/u, "");
const webhookUrl = baseUrl ? `${baseUrl}/webhooks/line` : "";

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
add("LINE_CHANNEL_SECRET", Boolean(secret), secret ? "configured" : "missing");
add("LINE_CHANNEL_ACCESS_TOKEN", Boolean(token), token ? "configured" : "missing");
add("Webhook base URL", Boolean(baseUrl), baseUrl || "set LINE_WEBHOOK_BASE_URL or PUBLIC_HOST");

if (token) {
  const headers = { authorization: `Bearer ${token}` };
  const botInfo = await fetch("https://api.line.me/v2/bot/info", { headers });
  const info = await safeJson(botInfo);
  add("Channel access token", botInfo.ok, botInfo.ok ? `bot=${info.displayName ?? "resolved"}` : `LINE ${botInfo.status}`);

  const endpointResponse = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", { headers });
  const endpoint = await safeJson(endpointResponse);
  add("Registered webhook", endpointResponse.ok && endpoint.endpoint === webhookUrl && endpoint.active === true,
    endpointResponse.ok
      ? `registered=${endpoint.endpoint || "none"}, active=${String(endpoint.active)}, expected=${webhookUrl || "unset"}`
      : `LINE ${endpointResponse.status}`);
}

if (secret && webhookUrl) {
  const body = JSON.stringify({ destination: "preflight", events: [] });
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": signature },
      body
    });
    add("Signed webhook delivery", response.status === 200, `HTTP ${response.status}`);
  } catch (error) {
    add("Signed webhook delivery", false, error instanceof Error ? error.message : String(error));
  }
}

console.log(JSON.stringify({ ready: checks.every((check) => check.passed), webhookUrl: webhookUrl || null, checks }, null, 2));
if (checks.some((check) => !check.passed)) process.exitCode = 1;

async function safeJson(response) {
  try { return await response.json(); } catch { return {}; }
}
