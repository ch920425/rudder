import { buildLibraryFileMentionHref } from "@rudderhq/shared";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveOrganizationWorkspaceRoot } from "../home-paths.js";

type ResolvedLibraryFile = {
  absolutePath: string;
  basename: string;
  href: string;
};

const PROTECTED_MARKDOWN_CODE_RE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`+[^`\n]*(?:`+|$))/g;
const MARKDOWN_LINK_RE = /(!?)\[([^\]\n]*(?:\\\][^\]\n]*)*)]\(([^)\n]+)\)/g;
const TRAILING_PATH_PUNCTUATION_RE = /[.,;:!?]+$/;
const LIBRARY_FILE_MENTION_SCHEME = "library-file://";
const LIBRARY_ENTRY_MENTION_SCHEME = "library-entry://";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeMarkdownLinkLabel(label: string) {
  return label.replace(/([\\[\]])/g, "\\$1");
}

function normalizePortablePath(value: string) {
  return value.replace(/\\/g, "/");
}

function isPathInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function splitProtectedMarkdownCode(markdown: string) {
  const segments: Array<{ value: string; protected: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(PROTECTED_MARKDOWN_CODE_RE);
  while ((match = re.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ value: markdown.slice(lastIndex, match.index), protected: false });
    }
    segments.push({ value: match[0], protected: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < markdown.length) {
    segments.push({ value: markdown.slice(lastIndex), protected: false });
  }
  return segments;
}

async function replaceAsync(
  value: string,
  re: RegExp,
  replacer: (match: RegExpExecArray) => Promise<string>,
) {
  let output = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const matcher = new RegExp(re);
  while ((match = matcher.exec(value)) !== null) {
    output += value.slice(lastIndex, match.index);
    output += await replacer(match);
    lastIndex = match.index + match[0].length;
  }
  output += value.slice(lastIndex);
  return output;
}

function hrefToLocalPathCandidate(href: string) {
  const trimmed = href.trim();
  if (
    trimmed.startsWith(LIBRARY_FILE_MENTION_SCHEME)
    || trimmed.startsWith(LIBRARY_ENTRY_MENTION_SCHEME)
  ) {
    return null;
  }
  const unwrapped = trimmed.startsWith("<") && trimmed.endsWith(">")
    ? trimmed.slice(1, -1)
    : trimmed;
  try {
    return decodeURI(unwrapped);
  } catch {
    return unwrapped;
  }
}

async function resolveLibraryFilePath(
  rawPath: string,
  workspaceRoot: string,
  cache: Map<string, ResolvedLibraryFile | null>,
) {
  const trimmed = rawPath.trim();
  if (!trimmed || !path.isAbsolute(trimmed)) return null;

  const resolved = path.resolve(trimmed);
  const cached = cache.get(resolved);
  if (cached !== undefined) return cached;

  if (!isPathInside(workspaceRoot, resolved)) {
    cache.set(resolved, null);
    return null;
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      cache.set(resolved, null);
      return null;
    }
  } catch {
    cache.set(resolved, null);
    return null;
  }

  const relativePath = normalizePortablePath(path.relative(workspaceRoot, resolved));
  const basename = path.basename(resolved);
  const file = {
    absolutePath: resolved,
    basename,
    href: buildLibraryFileMentionHref(relativePath, basename),
  };
  cache.set(resolved, file);
  return file;
}

async function normalizeMarkdownLinkHrefs(
  markdown: string,
  workspaceRoot: string,
  cache: Map<string, ResolvedLibraryFile | null>,
) {
  return replaceAsync(markdown, MARKDOWN_LINK_RE, async (match) => {
    const [raw, imageMarker, label, href] = match;
    if (imageMarker) return raw;
    const localPath = hrefToLocalPathCandidate(href);
    if (!localPath) return raw;
    const file = await resolveLibraryFilePath(localPath, workspaceRoot, cache);
    if (!file) return raw;
    const nextLabel = label.trim() ? label : escapeMarkdownLinkLabel(file.basename);
    return `[${nextLabel}](${file.href})`;
  });
}

async function normalizeBarePathsInSegment(
  markdown: string,
  workspaceRoot: string,
  cache: Map<string, ResolvedLibraryFile | null>,
) {
  const linkMatcher = new RegExp(MARKDOWN_LINK_RE);
  const rootPrefixRe = new RegExp(`${escapeRegExp(workspaceRoot)}(?:/[^\\s<>()\\[\\]{}'"]+)+`, "g");
  let output = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkMatcher.exec(markdown)) !== null) {
    output += await replaceAsync(markdown.slice(lastIndex, match.index), rootPrefixRe, async (pathMatch) => {
      const raw = pathMatch[0];
      const trailing = raw.match(TRAILING_PATH_PUNCTUATION_RE)?.[0] ?? "";
      const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
      const file = await resolveLibraryFilePath(candidate, workspaceRoot, cache);
      if (!file) return raw;
      return `[${escapeMarkdownLinkLabel(file.basename)}](${file.href})${trailing}`;
    });
    output += match[0];
    lastIndex = match.index + match[0].length;
  }
  output += await replaceAsync(markdown.slice(lastIndex), rootPrefixRe, async (pathMatch) => {
    const raw = pathMatch[0];
    const trailing = raw.match(TRAILING_PATH_PUNCTUATION_RE)?.[0] ?? "";
    const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
    const file = await resolveLibraryFilePath(candidate, workspaceRoot, cache);
    if (!file) return raw;
    return `[${escapeMarkdownLinkLabel(file.basename)}](${file.href})${trailing}`;
  });
  return output;
}

export async function normalizeLocalLibraryPathMarkdown(markdown: string, orgId: string) {
  if (!markdown.trim()) return markdown;
  const workspaceRoot = path.resolve(resolveOrganizationWorkspaceRoot(orgId));
  if (!markdown.includes(workspaceRoot)) return markdown;

  const cache = new Map<string, ResolvedLibraryFile | null>();
  const segments = splitProtectedMarkdownCode(markdown);
  const normalized: string[] = [];
  for (const segment of segments) {
    if (segment.protected) {
      normalized.push(segment.value);
      continue;
    }
    const withLinkHrefs = await normalizeMarkdownLinkHrefs(segment.value, workspaceRoot, cache);
    normalized.push(await normalizeBarePathsInSegment(withLinkHrefs, workspaceRoot, cache));
  }
  return normalized.join("");
}
