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
    const desktopEnter = cssBlock("@keyframes command-palette-enter");
    const desktopExit = cssBlock("@keyframes command-palette-exit");
    const mobileEnter = cssBlock("@keyframes command-palette-enter-mobile");
    const mobileExit = cssBlock("@keyframes command-palette-exit-mobile");
    const commandPaletteMotion = [
      commandPaletteContent,
      desktopEnter,
      desktopExit,
      mobileEnter,
      mobileExit,
    ].join("\n");

    expect(commandPaletteContent).toContain("will-change: opacity, transform");
    expect(commandPaletteMotion).not.toContain("filter:");
    expect(commandPaletteMotion).not.toContain("backdrop-filter");
    expect(commandPaletteMotion).not.toContain("scale(");
  });

  it("positions command palette against the viewport", () => {
    const commandPaletteContent = cssBlock(".command-palette-content");
    const commandPaletteDesktopPositioning =
      indexCss.match(/@media \(min-width: 768px\) \{\s*\[data-slot="dialog-content"\]\.command-palette-content \{[^}]+}/)?.[0] ?? "";

    expect(commandPaletteContent).toContain("left: 50vw !important");
    expect(commandPaletteDesktopPositioning).toContain("top: 50vh !important");
  });

  it("keeps glass popovers above utility backgrounds", () => {
    const glassPopover = cssBlock(".glass-popover.glass-popover");

    expect(glassPopover).toContain("background:");
    expect(glassPopover).toContain("!important");
    expect(glassPopover).toContain("backdrop-filter: blur(30px) saturate(132%)");
  });

  it("keeps the macOS desktop shell translucent in light mode", () => {
    const lightDesktopBackdrop = cssBlock("html.desktop-shell-macos .app-shell-backdrop");

    expect(lightDesktopBackdrop).toContain("rgb(250 248 245 / 0.46)");
    expect(lightDesktopBackdrop).toContain("rgb(244 240 234 / 0.34)");
    expect(lightDesktopBackdrop).toContain("backdrop-filter: blur(38px) saturate(122%)");
  });
});
