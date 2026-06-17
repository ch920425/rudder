interface CachedLibraryEntryMetadata {
  currentPath: string | null;
}

const LIBRARY_ENTRY_CACHE_STORAGE_PREFIX = "rudder.libraryEntryCache";

function libraryEntryCacheStorageKey(orgId: string, entryId: string) {
  return `${LIBRARY_ENTRY_CACHE_STORAGE_PREFIX}.${orgId}.${entryId}`;
}

function normalizeCachedPath(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function getCachedLibraryEntryMetadata(orgId: string | null | undefined, entryId: string | null | undefined) {
  if (!orgId || !entryId || typeof window === "undefined") return null;

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
