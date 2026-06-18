import type { LibraryEntry } from "@rudderhq/shared";
import { organizationsApi } from "../api/orgs";

type CachedLibraryEntryMetadata = Pick<LibraryEntry, "currentPath"> & Partial<Pick<LibraryEntry, "status">>;

const LIBRARY_ENTRY_CACHE_STORAGE_PREFIX = "rudder.libraryEntryCache";
const LIBRARY_ENTRY_CACHE_TTL_MS = 5 * 60 * 1000;
const SELECTED_ORG_STORAGE_KEY = "rudder.selectedOrganizationId";

type LibraryEntryCacheRecord = {
  expiresAt: number;
  entry?: LibraryEntry;
  promise?: Promise<LibraryEntry>;
};

const libraryEntryCache = new Map<string, LibraryEntryCacheRecord>();

function cacheKey(orgId: string, entryId: string) {
  return `${orgId}:library-entry:${entryId}`;
}

function currentTimeMs() {
  return Date.now();
}

function isFresh(record: LibraryEntryCacheRecord | undefined) {
  return Boolean(record && record.expiresAt > currentTimeMs());
}

function libraryEntryCacheStorageKey(orgId: string, entryId: string) {
  return `${LIBRARY_ENTRY_CACHE_STORAGE_PREFIX}.${orgId}.${entryId}`;
}

function normalizeCachedPath(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getCachedLibraryEntryPathFromStorage(orgId: string, entryId: string): CachedLibraryEntryMetadata | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage?.getItem(libraryEntryCacheStorageKey(orgId, entryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedLibraryEntryMetadata> | null;
    const currentPath = normalizeCachedPath(parsed?.currentPath);
    return currentPath ? { currentPath } : null;
  } catch {
    return null;
  }
}

export function readSelectedOrganizationIdFromStorage() {
  if (typeof window === "undefined") return null;
  if (typeof window.localStorage?.getItem !== "function") return null;
  return window.localStorage.getItem(SELECTED_ORG_STORAGE_KEY);
}

export function getCachedLibraryEntryMetadata(orgId: string | null | undefined, entryId: string | null | undefined) {
  if (!orgId || !entryId) return null;
  const record = libraryEntryCache.get(cacheKey(orgId, entryId));
  if (isFresh(record) && record?.entry) return record.entry;
  return getCachedLibraryEntryPathFromStorage(orgId, entryId);
}

export function loadLibraryEntryMetadata(orgId: string, entryId: string) {
  const key = cacheKey(orgId, entryId);
  const existing = libraryEntryCache.get(key);
  if (isFresh(existing)) {
    if (existing?.entry) return Promise.resolve(existing.entry);
    if (existing?.promise) return existing.promise;
  }

  const promise = organizationsApi.getLibraryEntry(orgId, entryId)
    .then((entry) => {
      libraryEntryCache.set(key, {
        entry,
        expiresAt: currentTimeMs() + LIBRARY_ENTRY_CACHE_TTL_MS,
      });
      return entry;
    })
    .catch((error) => {
      libraryEntryCache.delete(key);
      throw error;
    });
  libraryEntryCache.set(key, {
    promise,
    expiresAt: currentTimeMs() + LIBRARY_ENTRY_CACHE_TTL_MS,
  });
  return promise;
}

export function prefetchLibraryEntryMetadata(orgId: string | null | undefined, entryId: string | null | undefined) {
  if (!orgId || !entryId) return;
  void loadLibraryEntryMetadata(orgId, entryId).catch(() => {
    // Link prefetch is opportunistic; the destination page still owns errors.
  });
}

export function __clearLibraryEntryMetadataCacheForTests() {
  libraryEntryCache.clear();
}

export function __setLibraryEntryMetadataCacheForTests(orgId: string, entry: LibraryEntry) {
  libraryEntryCache.set(cacheKey(orgId, entry.id), {
    entry,
    expiresAt: currentTimeMs() + LIBRARY_ENTRY_CACHE_TTL_MS,
  });
}
