import { describe, expect, it } from "vitest";
import { normalizeEscapedMarkdownNewlines, normalizeMarkdownHtmlBreaks, normalizeRelaxedMarkdownSyntax, normalizeRenderedMarkdownSource } from "./markdown-normalize";

describe("normalizeRelaxedMarkdownSyntax", () => {
  it("repairs hard-wrapped URL link destinations", () => {
    expect(normalizeRelaxedMarkdownSyntax([
      "[https://github.com/Undertone0809/rudder/releases?page=5](https://github.com/Undertone0809/rudder/releases?",
      "page=5)",
    ].join("\n"))).toBe(
      "[https://github.com/Undertone0809/rudder/releases?page=5](https://github.com/Undertone0809/rudder/releases?page=5)",
    );
  });

  it("normalizes compact task-list and escaped-bracket list markers", () => {
    expect(normalizeRelaxedMarkdownSyntax("-[]1\n-[x]done\n-\\[]1")).toBe("- [ ] 1\n- [x] done\n- \\[]1");
  });

  it("does not normalize examples inside fenced code blocks", () => {
    const source = [
      "```md",
      "-[]1",
      "[https://example.com](https://example.com?",
      "a=1)",
      "```",
    ].join("\n");

    expect(normalizeRelaxedMarkdownSyntax(source)).toBe(source);
  });
});

describe("normalizeEscapedMarkdownNewlines", () => {
  it("turns escaped newline blocks into real markdown newlines", () => {
    expect(normalizeEscapedMarkdownNewlines("Plan complete.\\n\\n1. Confirm\\n2. Ship")).toBe(
      "Plan complete.\n\n1. Confirm\n2. Ship",
    );
  });

  it("leaves isolated escaped newline examples alone", () => {
    expect(normalizeEscapedMarkdownNewlines("Use `\\n` for newline examples.")).toBe("Use `\\n` for newline examples.");
  });
});

describe("normalizeMarkdownHtmlBreaks", () => {
  it("removes standalone html break tags from prose while preserving the surrounding text", () => {
    expect(normalizeMarkdownHtmlBreaks("First line\n<br />\nSecond line\nDone<br />again")).toBe(
      "First line\n\nSecond line\nDone\nagain",
    );
  });

  it("preserves html break examples inside code and markdown link labels", () => {
    const source = "Use `<br />` in docs.\n\n```html\n<br />\n```\n\nSee [literal <br />](https://example.com).";
    expect(normalizeMarkdownHtmlBreaks(source)).toBe(source);
  });
});

describe("normalizeRenderedMarkdownSource", () => {
  it("applies escaped newline, html break, and relaxed markdown normalization together", () => {
    expect(normalizeRenderedMarkdownSource("Plan\\n\\n-[]todo\\n<br />\\nDone")).toBe("Plan\n\n- [ ] todo\n\nDone");
  });
});
