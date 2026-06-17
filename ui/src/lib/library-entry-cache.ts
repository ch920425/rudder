import type { LibraryEntry } from "@rudderhq/shared";
import { organizationsApi } from "../api/orgs";

const cache = new Map<string, LibraryEntry>();
const inFlight = new Map<string, Promise<LibraryEntry>>();

function key(orgId: string | null | undefined, entryId: string | null | undefined) {
  return orgId && entryId ? `${orgId}:${entryId}` : null;
}

export function getCachedLibraryEntryMetadata(orgId: string | null | undefined, entryId: string | null | undefined) {
  const cacheKey = key(orgId, entryId);
  return cacheKey ? cache.get(cacheKey) ?? null : null;
}

export function readSelectedOrganizationIdFromStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("rudder.selectedOrganizationId");
}

export function cacheLibraryEntryMetadata(entry: LibraryEntry) {
  cache.set(`${entry.orgId}:${entry.id}`, entry);
}

export async function loadLibraryEntryMetadata(orgId: string, entryId: string) {
  const cacheKey = key(orgId, entryId)!;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const promise = organizationsApi.getLibraryEntry(orgId, entryId)
    .then((entry) => {
      cacheLibraryEntryMetadata(entry);
      inFlight.delete(cacheKey);
      return entry;
    })
    .catch((error) => {
      inFlight.delete(cacheKey);
      throw error;
    });
  inFlight.set(cacheKey, promise);
  return promise;
}

export function prefetchLibraryEntryMetadata(
  orgId: string | null | undefined,
  entryId: string | null | undefined,
) {
  if (!orgId || !entryId) return;
  void loadLibraryEntryMetadata(orgId, entryId);
}

export function __setLibraryEntryMetadataCacheForTests(orgId: string, entry: LibraryEntry) {
  cache.set(`${orgId}:${entry.id}`, entry);
}

export function __clearLibraryEntryMetadataCacheForTests() {
  cache.clear();
  inFlight.clear();
}
