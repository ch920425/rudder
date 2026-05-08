import { spawn } from "node:child_process";
import type { Db } from "@rudderhq/db";
import { organizations, instanceSettings } from "@rudderhq/db";
import { isUnsafeGitIdentityEmail } from "@rudderhq/agent-runtime-utils/git-identity";
import {
  instanceGeneralSettingsSchema,
  instanceGitIdentitySettingsSchema,
  type InstanceDetectedGitIdentity,
  type InstanceGeneralSettings,
  type InstanceGitIdentitySettings,
  type InstanceGitIdentityState,
  type InstanceLocale,
  instanceNotificationSettingsSchema,
  type InstanceNotificationSettings,
  type PatchInstanceGeneralSettings,
  type PatchInstanceNotificationSettings,
  type InstanceSettings,
} from "@rudderhq/shared";
import { eq } from "drizzle-orm";

const DEFAULT_SINGLETON_KEY = "default";

function normalizeGeneralSettings(raw: unknown): InstanceGeneralSettings {
  const parsed = instanceGeneralSettingsSchema.safeParse(raw ?? {});
  if (parsed.success) {
    return {
      censorUsernameInLogs: parsed.data.censorUsernameInLogs ?? false,
      locale: parsed.data.locale ?? "en",
      gitIdentity: parsed.data.gitIdentity ?? null,
    };
  }
  return {
    censorUsernameInLogs: false,
    locale: "en",
    gitIdentity: null,
  };
}

export function normalizeInstanceLocale(raw: unknown): InstanceLocale {
  return normalizeGeneralSettings({ locale: raw }).locale;
}

function normalizeNotificationSettings(raw: unknown): InstanceNotificationSettings {
  const parsed = instanceNotificationSettingsSchema.safeParse(raw ?? {});
  if (parsed.success) {
    const desktopIssueNotifications =
      parsed.data.desktopIssueNotifications ?? parsed.data.desktopInboxNotifications ?? true;
    return {
      desktopInboxNotifications: desktopIssueNotifications,
      desktopDockBadge: parsed.data.desktopDockBadge ?? true,
      desktopIssueNotifications,
      desktopChatNotifications: parsed.data.desktopChatNotifications ?? true,
    };
  }
  return {
    desktopInboxNotifications: true,
    desktopDockBadge: true,
    desktopIssueNotifications: true,
    desktopChatNotifications: true,
  };
}

function toInstanceSettings(row: typeof instanceSettings.$inferSelect): InstanceSettings {
  return {
    id: row.id,
    general: normalizeGeneralSettings(row.general),
    notifications: normalizeNotificationSettings(row.notifications),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function runGitConfigGet(key: "user.name" | "user.email"): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["config", "--global", "--get", key], {
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? nonEmpty(stdout) : null));
  });
}

async function detectHostGlobalGitIdentity(): Promise<InstanceDetectedGitIdentity | null> {
  const [name, email] = await Promise.all([
    runGitConfigGet("user.name"),
    runGitConfigGet("user.email"),
  ]);
  if (!name && !email) return null;
  return {
    name: name ?? "",
    email: email ?? "",
    source: "host_global",
    unsafe: !name || isUnsafeGitIdentityEmail(email),
  };
}

function savedIdentityIsSafe(identity: InstanceGitIdentitySettings | null): identity is InstanceGitIdentitySettings {
  return Boolean(
    identity?.confirmed === true &&
    nonEmpty(identity.name) &&
    nonEmpty(identity.email) &&
    !isUnsafeGitIdentityEmail(identity.email),
  );
}

function buildGitIdentityState(
  saved: InstanceGitIdentitySettings | null,
  detected: InstanceDetectedGitIdentity | null,
): InstanceGitIdentityState {
  if (savedIdentityIsSafe(saved)) {
    return {
      saved,
      detected,
      effective: saved,
      status: "confirmed",
      warning: null,
    };
  }
  if (saved && !savedIdentityIsSafe(saved)) {
    return {
      saved,
      detected,
      effective: null,
      status: "unsafe",
      warning: "The saved Git identity is incomplete or unsafe. Update it before local agents create commits.",
    };
  }
  if (detected) {
    if (detected.unsafe) {
      return {
        saved: null,
        detected,
        effective: null,
        status: "unsafe",
        warning: "The detected host Git identity is missing a name/email or uses an unsafe local email.",
      };
    }
    return {
      saved: null,
      detected,
      effective: detected,
      status: "detected",
      warning: "Confirm this detected host Git identity before Rudder uses it as the managed runtime identity.",
    };
  }
  return {
    saved: null,
    detected: null,
    effective: null,
    status: "missing",
    warning: "No safe host Git identity was detected. Configure user.name and user.email or save an override.",
  };
}

function normalizeGitIdentityForStorage(identity: InstanceGitIdentitySettings): InstanceGitIdentitySettings {
  const parsed = instanceGitIdentitySettingsSchema.parse(identity);
  return {
    name: parsed.name,
    email: parsed.email,
    confirmed: parsed.confirmed,
    source: parsed.source,
    lastDetectedAt: parsed.lastDetectedAt,
  };
}

export function instanceSettingsService(db: Db) {
  async function getOrCreateRow() {
    const existing = await db
      .select()
      .from(instanceSettings)
      .where(eq(instanceSettings.singletonKey, DEFAULT_SINGLETON_KEY))
      .then((rows) => rows[0] ?? null);
    if (existing) return existing;

    const now = new Date();
    const [created] = await db
      .insert(instanceSettings)
      .values({
        singletonKey: DEFAULT_SINGLETON_KEY,
        general: {},
        notifications: {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [instanceSettings.singletonKey],
        set: {
          updatedAt: now,
        },
      })
      .returning();

    return created;
  }

  async function updateGeneralJson(patch: PatchInstanceGeneralSettings & { gitIdentity?: InstanceGitIdentitySettings | null }): Promise<InstanceSettings> {
    const current = await getOrCreateRow();
    const nextGeneral = normalizeGeneralSettings({
      ...normalizeGeneralSettings(current.general),
      ...patch,
    });
    const now = new Date();
    const [updated] = await db
      .update(instanceSettings)
      .set({
        general: { ...nextGeneral },
        updatedAt: now,
      })
      .where(eq(instanceSettings.id, current.id))
      .returning();
    return toInstanceSettings(updated ?? current);
  }

  return {
    get: async (): Promise<InstanceSettings> => toInstanceSettings(await getOrCreateRow()),

    getGeneral: async (): Promise<InstanceGeneralSettings> => {
      const row = await getOrCreateRow();
      return normalizeGeneralSettings(row.general);
    },

    getNotifications: async (): Promise<InstanceNotificationSettings> => {
      const row = await getOrCreateRow();
      return normalizeNotificationSettings(row.notifications);
    },

    detectGitIdentity: detectHostGlobalGitIdentity,

    getGitIdentity: async (): Promise<InstanceGitIdentityState> => {
      const row = await getOrCreateRow();
      const general = normalizeGeneralSettings(row.general);
      const detected = await detectHostGlobalGitIdentity();
      return buildGitIdentityState(general.gitIdentity, detected);
    },

    getConfirmedGitIdentity: async (): Promise<InstanceGitIdentitySettings | null> => {
      const row = await getOrCreateRow();
      const identity = normalizeGeneralSettings(row.general).gitIdentity;
      return savedIdentityIsSafe(identity) ? identity : null;
    },

    updateGitIdentity: async (identity: InstanceGitIdentitySettings): Promise<InstanceGitIdentityState> => {
      const normalized = normalizeGitIdentityForStorage(identity);
      const updated = await updateGeneralJson({ gitIdentity: normalized });
      const detected = await detectHostGlobalGitIdentity();
      return buildGitIdentityState(updated.general.gitIdentity, detected);
    },

    clearGitIdentity: async (): Promise<InstanceGitIdentityState> => {
      const updated = await updateGeneralJson({ gitIdentity: null });
      const detected = await detectHostGlobalGitIdentity();
      return buildGitIdentityState(updated.general.gitIdentity, detected);
    },

    updateGeneral: async (patch: PatchInstanceGeneralSettings): Promise<InstanceSettings> => {
      return updateGeneralJson(patch);
    },

    updateNotifications: async (patch: PatchInstanceNotificationSettings): Promise<InstanceSettings> => {
      const current = await getOrCreateRow();
      const nextNotifications = normalizeNotificationSettings({
        ...normalizeNotificationSettings(current.notifications),
        ...patch,
      });
      if (patch.desktopIssueNotifications != null) {
        nextNotifications.desktopInboxNotifications = nextNotifications.desktopIssueNotifications;
      } else if (patch.desktopInboxNotifications != null) {
        nextNotifications.desktopIssueNotifications = nextNotifications.desktopInboxNotifications;
      }
      if (
        (patch.desktopInboxNotifications === true || patch.desktopIssueNotifications === true)
        && patch.desktopDockBadge == null
      ) {
        nextNotifications.desktopDockBadge = true;
      }
      const now = new Date();
      const [updated] = await db
        .update(instanceSettings)
        .set({
          notifications: { ...nextNotifications },
          updatedAt: now,
        })
        .where(eq(instanceSettings.id, current.id))
        .returning();
      return toInstanceSettings(updated ?? current);
    },

    listCompanyIds: async (): Promise<string[]> =>
      db
        .select({ id: organizations.id })
        .from(organizations)
        .then((rows) => rows.map((row) => row.id)),
  };
}
