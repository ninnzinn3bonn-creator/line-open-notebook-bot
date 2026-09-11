import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyLineSignature } from "../../bridge/src/line/signature.js";

describe("LINE signature", () => {
  it("accepts only the HMAC of the untouched raw body", () => {
    const body = Buffer.from('{"events":[]}');
    const signature = createHmac("sha256", "secret").update(body).digest("base64");
    expect(verifyLineSignature(body, signature, "secret")).toBe(true);
    expect(verifyLineSignature(Buffer.from('{ "events": [] }'), signature, "secret")).toBe(false);
  });
});
