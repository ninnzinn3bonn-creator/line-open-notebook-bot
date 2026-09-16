import { describe, expect, it } from "vitest";
import { parseQuickReplies, textMessages } from "../../bridge/src/line/client.js";

describe("LINE quick replies", () => {
  it("parses configured labels and messages", () => {
    expect(parseQuickReplies("営業時間::営業時間を教えてください|担当者に相談::担当者に相談したいです")).toEqual([
      { label: "営業時間", text: "営業時間を教えてください" },
      { label: "担当者に相談", text: "担当者に相談したいです" }
    ]);
  });

  it("attaches quick replies only to the final text message", () => {
    const messages = textMessages("a".repeat(5001), [{ label: "営業時間", text: "営業時間を教えてください" }]);
    expect(messages).toHaveLength(2);
    expect(messages[0]).not.toHaveProperty("quickReply");
    expect(messages[1]?.quickReply?.items[0]).toEqual({
      type: "action",
      action: { type: "message", label: "営業時間", text: "営業時間を教えてください" }
    });
  });
});
