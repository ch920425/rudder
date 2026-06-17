function findClosingMarkdownToken(source: string, token: string, fromIndex: number) {
  const index = source.indexOf(token, fromIndex);
  return index >= 0 ? index : null;
}

function findClosingMarkdownParen(source: string, fromIndex: number) {
  let escaped = false;
  for (let index = fromIndex; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === ")") return index;
  }
  return null;
}

function normalizeWrappedInlineLinkDestinations(source: string) {
  return source.replace(
    /\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^)\n]*(?:\n[^\n)]*)+)\)/giu,
    (_match, label: string, destination: string) => {
      const normalizedDestination = destination.replace(/[ \t]*\n[ \t]*/g, "");
      return `[${label}](${normalizedDestination})`;
    },
  );
}

function normalizeCompactListMarkers(source: string) {
  return source
    .replace(
      /^([ \t]{0,3})([-+*])\[( |x|X)?\]([^\n]*)$/gmu,
      (_match, indent: string, marker: string, state: string | undefined, rest: string) => {
        const taskState = state && /^[xX]$/u.test(state) ? state : " ";
        const suffix = rest.trimStart();
        return `${indent}${marker} [${taskState}]${suffix ? ` ${suffix}` : ""}`;
      },
    )
    .replace(
      /^([ \t]{0,3})([-+*])\\(\[[^\]\n]*\])([^\n]*)$/gmu,
      (_match, indent: string, marker: string, bracketText: string, rest: string) => (
        `${indent}${marker} \\${bracketText}${rest}`
      ),
    );
}

function normalizeRelaxedMarkdownSegment(source: string) {
  return normalizeCompactListMarkers(normalizeWrappedInlineLinkDestinations(source));
}

export function normalizeEscapedMarkdownNewlines(source: string) {
  if (!source.includes("\\n")) return source;
  const escapedNewlineCount = source.match(/\\n/g)?.length ?? 0;
  if (escapedNewlineCount === 0) return source;

  const realNewlineCount = source.match(/\n/g)?.length ?? 0;
  const hasEscapedParagraph = source.includes("\\n\\n");
  const hasEscapedMarkdownList = /\\n\s*(?:[-*+]\s|\d+\.\s)/.test(source);
  const looksLikeEscapedBlock = realNewlineCount === 0 && escapedNewlineCount >= 3;

  if (!hasEscapedParagraph && !hasEscapedMarkdownList && !looksLikeEscapedBlock) {
    return source;
  }

  return source
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n");
}

const MARKDOWN_HTML_BREAK_RE = /(?:<br\s*\/?>|&lt;br\s*\/?&gt;)/giu;
const MARKDOWN_HTML_BREAK_ONLY_RE = /^(?:\s*(?:<br\s*\/?>|&lt;br\s*\/?&gt;)\s*)+$/iu;
const MARKDOWN_HTML_BREAK_AT_CURSOR_RE = /^(?:<br\s*\/?>|&lt;br\s*\/?&gt;)/iu;

function splitMarkdownHtmlBreakSegments(source: string): Array<{ text: string; protected: boolean }> {
  const parts: Array<{ text: string; protected: boolean }> = [];
  let cursor = 0;
  let plainStart = 0;

  function pushPlain(end: number) {
    if (end > plainStart) parts.push({ text: source.slice(plainStart, end), protected: false });
  }

  function pushProtected(end: number) {
    pushPlain(cursor);
    parts.push({ text: source.slice(cursor, end), protected: true });
    cursor = end;
    plainStart = end;
  }

  while (cursor < source.length) {
    const breakMatch = source.slice(cursor).match(MARKDOWN_HTML_BREAK_AT_CURSOR_RE);
    if (breakMatch) {
      cursor += breakMatch[0].length;
      continue;
    }

    const char = source[cursor];
    if (char === "`") {
      const fence = source.slice(cursor).match(/^`+/u)?.[0] ?? "`";
      const closing = findClosingMarkdownToken(source, fence, cursor + fence.length);
      pushProtected(closing !== null ? closing + fence.length : source.length);
      continue;
    }

    const linkStart = char === "[" ? cursor : char === "!" && source[cursor + 1] === "[" ? cursor + 1 : null;
    if (linkStart !== null) {
      const closeBracket = findClosingMarkdownToken(source, "]", linkStart + 1);
      if (closeBracket !== null && source[closeBracket + 1] === "(") {
        const closeParen = findClosingMarkdownParen(source, closeBracket + 2);
        if (closeParen !== null) {
          pushProtected(closeParen + 1);
          continue;
        }
      }
    }

    if (char === "<") {
      const closeAngle = findClosingMarkdownToken(source, ">", cursor + 1);
      if (closeAngle !== null) {
        pushProtected(closeAngle + 1);
        continue;
      }
    }

    cursor += 1;
  }

  pushPlain(source.length);
  return parts;
}

function replaceMarkdownHtmlBreaksInPlainText(source: string) {
  return source.split("\n").map((line) => {
    if (MARKDOWN_HTML_BREAK_ONLY_RE.test(line)) return "";
    return line.replace(MARKDOWN_HTML_BREAK_RE, "\n");
  }).join("\n");
}

function normalizeMarkdownHtmlBreaksOutsideFencedBlocks(source: string) {
  const output: string[] = [];
  const pendingPlainLines: string[] = [];
  let fenceMarker: "```" | "~~~" | null = null;

  function flushPlainLines() {
    if (pendingPlainLines.length === 0) return;
    const plainSource = pendingPlainLines.join("\n");
    output.push(
      splitMarkdownHtmlBreakSegments(plainSource).map((segment) => (
        segment.protected ? segment.text : replaceMarkdownHtmlBreaksInPlainText(segment.text)
      )).join(""),
    );
    pendingPlainLines.length = 0;
  }

  for (const line of source.split("\n")) {
    const fenceMatch = line.match(/^\s*(```|~~~)/u)?.[1] as "```" | "~~~" | undefined;
    if (fenceMatch && fenceMarker === null) {
      flushPlainLines();
      fenceMarker = fenceMatch;
      output.push(line);
      continue;
    }
    if (fenceMatch && fenceMarker === fenceMatch) {
      output.push(line);
      fenceMarker = null;
      continue;
    }
    if (fenceMarker !== null) {
      output.push(line);
      continue;
    }
    pendingPlainLines.push(line);
  }

  flushPlainLines();
  return output.join("\n");
}

export function normalizeMarkdownHtmlBreaks(source: string) {
  if (!/(?:<br|&lt;br)/iu.test(source)) return source;
  return normalizeMarkdownHtmlBreaksOutsideFencedBlocks(source);
}

export function normalizeRenderedMarkdownSource(source: string) {
  return normalizeRelaxedMarkdownSyntax(normalizeMarkdownHtmlBreaks(normalizeEscapedMarkdownNewlines(source)));
}

export function normalizeRelaxedMarkdownSyntax(source: string) {
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const output: string[] = [];
  let plainSegment: string[] = [];
  let fenceMarker: "`" | "~" | null = null;

  const flushPlainSegment = () => {
    if (plainSegment.length === 0) return;
    output.push(normalizeRelaxedMarkdownSegment(plainSegment.join("\n")));
    plainSegment = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1]?.[0] as "`" | "~" | undefined;
      if (!fenceMarker) {
        flushPlainSegment();
        fenceMarker = marker ?? null;
        output.push(line);
        continue;
      }
      if (marker === fenceMarker) {
        output.push(line);
        fenceMarker = null;
        continue;
      }
    }

    if (fenceMarker) {
      output.push(line);
    } else {
      plainSegment.push(line);
    }
  }

  flushPlainSegment();
  return output.join("\n");
}
