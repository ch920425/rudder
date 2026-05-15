import { createAvatar } from "@dicebear/core";
import * as notionists from "@dicebear/notionists";
import { AGENT_DICEBEAR_NOTIONISTS_ICON_PREFIX } from "@rudderhq/shared";

const AGENT_ASSET_ICON_RE =
  /^asset:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const AGENT_DICEBEAR_NOTIONISTS_ICON_RE = new RegExp(
  `^${AGENT_DICEBEAR_NOTIONISTS_ICON_PREFIX}([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`,
  "i",
);

const diceBearAvatarCache = new Map<string, string>();

export function normalizeAgentAvatarIconValue(icon: string | null | undefined) {
  const normalized = icon?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function createRandomAgentDiceBearIcon() {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => {
          const random =
            typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
              ? crypto.getRandomValues(new Uint8Array(1))[0]!
              : Math.floor(Math.random() * 256);
          return (Number(char) ^ (random & (15 >> (Number(char) / 4)))).toString(16);
        });
  return `${AGENT_DICEBEAR_NOTIONISTS_ICON_PREFIX}${uuid}`;
}

export function getAgentAvatarImageSrc(icon: string | null | undefined): string | null {
  const normalized = normalizeAgentAvatarIconValue(icon);
  const assetId = normalized?.match(AGENT_ASSET_ICON_RE)?.[1] ?? null;
  if (assetId) return `/api/assets/${assetId}/content`;

  const diceBearSeed = normalized?.match(AGENT_DICEBEAR_NOTIONISTS_ICON_RE)?.[1] ?? null;
  if (!diceBearSeed) return null;

  const cached = diceBearAvatarCache.get(diceBearSeed);
  if (cached) return cached;

  const dataUri = createAvatar(notionists, {
    seed: diceBearSeed,
    size: 256,
  }).toDataUri();
  diceBearAvatarCache.set(diceBearSeed, dataUri);
  return dataUri;
}
