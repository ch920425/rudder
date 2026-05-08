import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import type { InstanceGitIdentityState } from "@rudderhq/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import {
  SettingsChoiceCard,
  SettingsDivider,
  SettingsPageHeader,
  SettingsRow,
  SettingsToggle,
} from "@/components/settings/SettingsScaffold";
import { SettingsPageSkeleton } from "@/components/settings/SettingsPageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useI18n } from "../context/I18nContext";
import { useTheme } from "../context/ThemeContext";
import { queryKeys } from "../lib/queryKeys";
import { SETTINGS_PREFETCH_STALE_TIME_MS } from "@/lib/settings-prefetch";
import {
  readDesktopShell,
  type DesktopUpdateChannel,
} from "@/lib/desktop-shell";

function ThemePreview({ mode }: { mode: "light" | "system" | "dark" }) {
  return (
    <div className="grid gap-2">
      <div
        className="h-14 rounded-[calc(var(--radius-md)-4px)] border border-white/8"
        style={{
          background:
            mode === "light"
              ? "linear-gradient(180deg, #f4efe7 0%, #ece6dd 100%)"
              : mode === "dark"
                ? "linear-gradient(180deg, #312c28 0%, #262220 100%)"
                : "linear-gradient(90deg, #f1ece5 0%, #f1ece5 50%, #2b2724 50%, #2b2724 100%)",
        }}
      >
        <div className="flex h-full flex-col justify-between p-2.5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div
                className="h-1.5 w-10 rounded-full"
                style={{ background: mode === "dark" ? "rgb(255 255 255 / 0.28)" : "rgb(50 45 40 / 0.14)" }}
              />
              <div
                className="h-1.5 w-7 rounded-full"
                style={{ background: mode === "dark" ? "rgb(255 255 255 / 0.18)" : "rgb(50 45 40 / 0.10)" }}
              />
            </div>
            <div
              className="rounded-full px-2 py-1"
              style={{ background: mode === "dark" ? "rgb(0 0 0 / 0.38)" : "rgb(255 255 255 / 0.52)" }}
            >
              <div
                className="h-1.5 w-6 rounded-full"
                style={{ background: mode === "dark" ? "rgb(255 255 255 / 0.28)" : "rgb(50 45 40 / 0.14)" }}
              />
            </div>
          </div>
          <div
            className="flex items-center justify-between rounded-[12px] border px-2 py-1.5"
            style={{
              background: mode === "dark" ? "rgb(255 255 255 / 0.10)" : "rgb(255 255 255 / 0.68)",
              borderColor: mode === "dark" ? "rgb(255 255 255 / 0.10)" : "rgb(50 45 40 / 0.08)",
            }}
          >
            <div
              className="h-1.5 w-12 rounded-full"
              style={{ background: mode === "dark" ? "rgb(255 255 255 / 0.20)" : "rgb(50 45 40 / 0.12)" }}
            />
            <div className="h-2.5 w-2.5 rounded-full bg-[color:var(--accent-base)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LanguagePreview({
  primary,
  secondary,
}: {
  primary: string;
  secondary: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="rounded-[calc(var(--radius-md)-4px)] border border-white/8 bg-[color:color-mix(in_oklab,var(--surface-shell)_82%,transparent)] p-3">
        <div className="text-sm font-semibold text-foreground">{primary}</div>
        <div className="mt-1 text-xs text-muted-foreground">{secondary}</div>
      </div>
    </div>
  );
}

function formatGitIdentity(identity: InstanceGitIdentityState["effective"] | InstanceGitIdentityState["saved"] | InstanceGitIdentityState["detected"]): string {
  if (!identity) return "—";
  const name = identity.name?.trim() || "—";
  const email = identity.email?.trim() || "—";
  return `${name} <${email}>`;
}

function gitIdentityStatusClass(status: InstanceGitIdentityState["status"] | undefined): string {
  if (status === "confirmed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "detected") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "unsafe") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-[color:var(--border-soft)] bg-[color:var(--surface-inset)] text-muted-foreground";
}

export function InstanceGeneralSettings() {
  const { t } = useI18n();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [desktopUpdatesSupported, setDesktopUpdatesSupported] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<DesktopUpdateChannel>("stable");
  const [updateChannelPending, setUpdateChannelPending] = useState(false);
  const [gitIdentityName, setGitIdentityName] = useState("");
  const [gitIdentityEmail, setGitIdentityEmail] = useState("");
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setBreadcrumbs([
      { label: t("common.systemSettings") },
      { label: t("common.general") },
    ]);
  }, [setBreadcrumbs, t]);

  const generalQuery = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
    staleTime: SETTINGS_PREFETCH_STALE_TIME_MS,
  });

  const gitIdentityQuery = useQuery({
    queryKey: queryKeys.instance.gitIdentitySettings,
    queryFn: () => instanceSettingsApi.getGitIdentity(),
    staleTime: SETTINGS_PREFETCH_STALE_TIME_MS,
  });

  useEffect(() => {
    const identity = gitIdentityQuery.data?.saved ?? gitIdentityQuery.data?.detected ?? null;
    setGitIdentityName(identity?.name ?? "");
    setGitIdentityEmail(identity?.email ?? "");
  }, [
    gitIdentityQuery.data?.saved?.name,
    gitIdentityQuery.data?.saved?.email,
    gitIdentityQuery.data?.detected?.name,
    gitIdentityQuery.data?.detected?.email,
  ]);

  useEffect(() => {
    const desktopShell = readDesktopShell();
    const supported = Boolean(desktopShell?.getUpdateChannel && desktopShell?.setUpdateChannel);
    setDesktopUpdatesSupported(supported);
    if (!supported || !desktopShell?.getUpdateChannel) return;

    let cancelled = false;
    void desktopShell.getUpdateChannel()
      .then((channel) => {
        if (!cancelled) setUpdateChannel(channel);
      })
      .catch(() => {
        if (!cancelled) {
          setDesktopUpdatesSupported(false);
          setUpdateChannel("stable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleMutation = useMutation({
    mutationFn: async (patch: { censorUsernameInLogs?: boolean; locale?: "en" | "zh-CN" }) =>
      instanceSettingsApi.updateGeneral(patch),
    onSuccess: async (nextSettings) => {
      setActionError(null);
      queryClient.setQueryData(queryKeys.instance.generalSettings, nextSettings);
      queryClient.setQueryData(queryKeys.health, (current: { uiLocale?: "en" | "zh-CN" } | undefined) =>
        current ? { ...current, uiLocale: nextSettings.locale } : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.generalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("general.updateFailed"));
    },
  });

  const gitIdentityMutation = useMutation({
    mutationFn: instanceSettingsApi.updateGitIdentity,
    onSuccess: async (nextSettings) => {
      setActionError(null);
      queryClient.setQueryData(queryKeys.instance.gitIdentitySettings, nextSettings);
      const identity = nextSettings.saved ?? nextSettings.detected ?? null;
      setGitIdentityName(identity?.name ?? "");
      setGitIdentityEmail(identity?.email ?? "");
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.gitIdentitySettings });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("general.gitIdentity.updateFailed"));
    },
  });

  if (generalQuery.isLoading) {
    return <SettingsPageSkeleton />;
  }

  if (generalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {generalQuery.error instanceof Error
          ? generalQuery.error.message
          : t("general.loadFailed")}
      </div>
    );
  }

  const censorUsernameInLogs = generalQuery.data?.censorUsernameInLogs === true;
  const locale = generalQuery.data?.locale ?? "en";
  const gitIdentityState = gitIdentityQuery.data;
  const gitIdentityStatus = gitIdentityState?.status ?? "missing";
  const gitIdentityStatusLabel = t(`general.gitIdentity.status.${gitIdentityStatus}`);
  const gitIdentityCanConfirmDetected = gitIdentityState?.status === "detected";
  const gitIdentityCanClear = Boolean(gitIdentityState?.saved);
  const gitIdentityCanSave = gitIdentityName.trim().length > 0 && gitIdentityEmail.trim().length > 0;

  async function handleUpdateChannelToggle() {
    const desktopShell = readDesktopShell();
    if (!desktopShell?.setUpdateChannel) {
      setActionError(t("general.updates.unavailable"));
      return;
    }

    const nextChannel: DesktopUpdateChannel = updateChannel === "canary" ? "stable" : "canary";
    setUpdateChannelPending(true);
    try {
      const savedChannel = await desktopShell.setUpdateChannel(nextChannel);
      setUpdateChannel(savedChannel);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("general.updates.updateFailed"));
    } finally {
      setUpdateChannelPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-7 px-1 pb-6">
      <SettingsPageHeader
        icon={SlidersHorizontal}
        title={t("general.title")}
        description={t("general.description")}
      />

      {actionError ? (
        <div className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <SettingsDivider />

      <div className="space-y-3">
        <div className="text-sm font-medium text-foreground">{t("general.language.title")}</div>
        <div className="flex flex-wrap gap-2.5">
          <SettingsChoiceCard
            label={t("general.language.option.en.label")}
            description={t("general.language.option.en.description")}
            selected={locale === "en"}
            onClick={() => toggleMutation.mutate({ locale: "en" })}
            preview={
              <LanguagePreview
                primary={t("general.language.preview.en.primary")}
                secondary={t("general.language.preview.en.secondary")}
              />
            }
          />
          <SettingsChoiceCard
            label={t("general.language.option.zh-CN.label")}
            description={t("general.language.option.zh-CN.description")}
            selected={locale === "zh-CN"}
            onClick={() => toggleMutation.mutate({ locale: "zh-CN" })}
            preview={
              <LanguagePreview
                primary={t("general.language.preview.zh-CN.primary")}
                secondary={t("general.language.preview.zh-CN.secondary")}
              />
            }
          />
        </div>
      </div>

      <SettingsDivider />

      <SettingsRow
        title={t("general.logs.censor.title")}
        description={t("general.logs.censor.description")}
        className="border-t-0 pt-0"
        action={
          <SettingsToggle
            checked={censorUsernameInLogs}
            aria-label="Toggle username log censoring"
            disabled={toggleMutation.isPending}
            onClick={() => toggleMutation.mutate({ censorUsernameInLogs: !censorUsernameInLogs })}
          />
        }
      />

      <SettingsDivider />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">{t("general.gitIdentity.title")}</div>
            <div className="mt-1 max-w-3xl text-[13px] leading-5 text-muted-foreground">
              {t("general.gitIdentity.description")}
            </div>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${gitIdentityStatusClass(gitIdentityState?.status)}`}>
            {gitIdentityStatusLabel}
          </span>
        </div>

        <div className="rounded-[calc(var(--radius-md)-1px)] border border-[color:var(--border-soft)] bg-[color:color-mix(in_oklab,var(--surface-inset)_78%,transparent)] p-4">
          {gitIdentityQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">{t("general.gitIdentity.loading")}</div>
          ) : gitIdentityQuery.error ? (
            <div className="text-sm text-destructive">
              {gitIdentityQuery.error instanceof Error
                ? gitIdentityQuery.error.message
                : t("general.gitIdentity.loadFailed")}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 text-[13px] leading-5 sm:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">{t("general.gitIdentity.savedLabel")}</div>
                  <div className="mt-1 font-medium text-foreground">{formatGitIdentity(gitIdentityState?.saved ?? null)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t("general.gitIdentity.detectedLabel")}</div>
                  <div className="mt-1 font-medium text-foreground">{formatGitIdentity(gitIdentityState?.detected ?? null)}</div>
                </div>
              </div>

              {gitIdentityState?.warning ? (
                <div className="rounded-[var(--radius-sm)] border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[13px] leading-5 text-amber-700 dark:text-amber-300">
                  {gitIdentityState.warning}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="git-identity-name">{t("general.gitIdentity.nameLabel")}</Label>
                  <Input
                    id="git-identity-name"
                    value={gitIdentityName}
                    placeholder={t("general.gitIdentity.namePlaceholder")}
                    onChange={(event) => setGitIdentityName(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="git-identity-email">{t("general.gitIdentity.emailLabel")}</Label>
                  <Input
                    id="git-identity-email"
                    type="email"
                    value={gitIdentityEmail}
                    placeholder={t("general.gitIdentity.emailPlaceholder")}
                    onChange={(event) => setGitIdentityEmail(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {gitIdentityCanConfirmDetected ? (
                  <Button
                    size="sm"
                    disabled={gitIdentityMutation.isPending}
                    onClick={() => gitIdentityMutation.mutate({ confirmDetected: true })}
                  >
                    {t("general.gitIdentity.confirmDetected")}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={gitIdentityCanConfirmDetected ? "outline" : "default"}
                  disabled={gitIdentityMutation.isPending || !gitIdentityCanSave}
                  onClick={() => gitIdentityMutation.mutate({ name: gitIdentityName, email: gitIdentityEmail })}
                >
                  {t("general.gitIdentity.saveOverride")}
                </Button>
                {gitIdentityCanClear ? (
                  <Button
                    size="sm"
                    variant="quiet"
                    disabled={gitIdentityMutation.isPending}
                    onClick={() => gitIdentityMutation.mutate({ clear: true })}
                  >
                    {t("general.gitIdentity.clear")}
                  </Button>
                ) : null}
              </div>

              <div className="text-[12px] leading-5 text-muted-foreground">
                {t("general.gitIdentity.cliAuthNote")}
              </div>
            </div>
          )}
        </div>
      </div>

      <SettingsDivider />
      {desktopUpdatesSupported ? (
        <>
          <SettingsRow
            title={t("general.updates.canary.title")}
            description={updateChannel === "canary"
              ? t("general.updates.canary.enabledDescription")
              : t("general.updates.canary.disabledDescription")}
            className="border-t-0 pt-0"
            action={
              <SettingsToggle
                checked={updateChannel === "canary"}
                aria-label="Toggle canary desktop updates"
                disabled={updateChannelPending}
                onClick={() => void handleUpdateChannelToggle()}
              />
            }
          />

          <SettingsDivider />
        </>
      ) : null}

      <div className="space-y-3">
        <div className="text-sm font-medium text-foreground">{t("general.appearance.colorMode")}</div>
        <div className="flex flex-wrap gap-2.5">
          <SettingsChoiceCard
            label={t("general.appearance.light.label")}
            description={t("general.appearance.light.description")}
            selected={theme === "light"}
            onClick={() => setTheme("light")}
            preview={<ThemePreview mode="light" />}
          />
          <SettingsChoiceCard
            label={t("general.appearance.system.label")}
            description={t("general.appearance.system.description")}
            selected={theme === "system"}
            onClick={() => setTheme("system")}
            preview={<ThemePreview mode="system" />}
          />
          <SettingsChoiceCard
            label={t("general.appearance.dark.label")}
            description={t("general.appearance.dark.description")}
            selected={theme === "dark"}
            onClick={() => setTheme("dark")}
            preview={<ThemePreview mode="dark" />}
          />
        </div>
      </div>
    </div>
  );
}
