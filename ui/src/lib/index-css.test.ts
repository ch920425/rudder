import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexCss = readFileSync(new URL("../index.css", import.meta.url), "utf8");

function cssBlock(selector: string) {
  const start = indexCss.indexOf(selector);
  if (start === -1) return "";

  const firstBrace = indexCss.indexOf("{", start);
  if (firstBrace === -1) return "";

  let depth = 0;
  for (let index = firstBrace; index < indexCss.length; index += 1) {
    const char = indexCss[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return indexCss.slice(firstBrace + 1, index);
  }

  return "";
}

describe("index.css motion rules", () => {
  it("keeps command palette entry animation on compositor-friendly properties", () => {
    const commandPaletteContent = cssBlock(".command-palette-content");
    const desktopPop = cssBlock("@keyframes command-palette-pop");
    const desktopClose = cssBlock("@keyframes command-palette-close");
    const mobilePop = cssBlock("@keyframes command-palette-pop-mobile");
    const mobileClose = cssBlock("@keyframes command-palette-close-mobile");
    const commandPaletteMotion = [
      commandPaletteContent,
      desktopPop,
      desktopClose,
      mobilePop,
      mobileClose,
    ].join("\n");

    expect(commandPaletteContent).toContain("will-change: opacity, transform");
    expect(commandPaletteMotion).not.toContain("filter:");
    expect(commandPaletteMotion).not.toContain("backdrop-filter");
  });
});
