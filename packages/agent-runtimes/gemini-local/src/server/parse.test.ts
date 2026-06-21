import { describe, expect, it } from "vitest";
import { detectGeminiAuthRequired, parseGeminiJsonl } from "./parse.js";

describe("parseGeminiJsonl", () => {
  it("parses current Gemini CLI assistant message events", () => {
    const parsed = parseGeminiJsonl([
      JSON.stringify({ type: "init", session_id: "session-1" }),
      JSON.stringify({ type: "message", role: "assistant", content: "hello", delta: true }),
      JSON.stringify({ type: "result", status: "success" }),
    ].join("\n"));

    expect(parsed.sessionId).toBe("session-1");
    expect(parsed.summary).toBe("hello");
  });
});

describe("detectGeminiAuthRequired", () => {
  it("treats missing Gemini auth-method settings as auth required", () => {
    expect(
      detectGeminiAuthRequired({
        parsed: null,
        stdout: "",
        stderr:
          "Please set an Auth method in your /tmp/gemini-home/.gemini/settings.json or specify one of the following environment variables before running: GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA",
      }),
    ).toEqual({
      requiresAuth: true,
      message:
        "Please set an Auth method in your /tmp/gemini-home/.gemini/settings.json or specify one of the following environment variables before running: GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA",
    });
  });

  it("treats ineligible Gemini account tiers as auth required", () => {
    expect(
      detectGeminiAuthRequired({
        parsed: null,
        stdout: "",
        stderr:
          "IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals. reasonCode: 'UNSUPPORTED_CLIENT'",
      }),
    ).toEqual({
      requiresAuth: true,
      message:
        "IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals. reasonCode: 'UNSUPPORTED_CLIENT'",
    });
  });
});
