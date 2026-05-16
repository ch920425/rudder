import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Bug,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  FileText,
  FolderOpen,
  GitPullRequest,
  MoreHorizontal,
  Newspaper,
  Play,
  Plus,
  Radio,
  Repeat,
  ShieldCheck,
  User,
  Zap,
} from "lucide-react";
import { automationsApi } from "../api/automations";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { organizationSkillsApi } from "../api/organizationSkills";
import { projectsApi } from "../api/projects";
import { useOrganization } from "../context/OrganizationContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { formatChatAgentLabel } from "../lib/agent-labels";
import { buildAgentSkillMentionOptions } from "../lib/agent-skill-mentions";
import { buildMarkdownMentionOptions } from "../lib/markdown-mention-options";
import { projectColorBackgroundStyle } from "../lib/project-colors";
import { queryKeys } from "../lib/queryKeys";
import { getRecentAssigneeIds, sortAgentsByRecency, trackRecentAssignee } from "../lib/recent-assignees";
import { formatDateTimeSeconds } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { InlineEntitySelector, type InlineEntityOption } from "../components/InlineEntitySelector";
import { MarkdownEditor, type MarkdownEditorRef } from "../components/MarkdownEditor";
import { ScheduleEditor, describeSchedule } from "../components/ScheduleEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const concurrencyPolicies = ["coalesce_if_active", "always_enqueue", "skip_if_active"];
const catchUpPolicies = ["skip_missed", "enqueue_missed_with_cap"];
const concurrencyPolicyDescriptions: Record<string, string> = {
  coalesce_if_active: "If a run is already active, keep just one follow-up run queued.",
  always_enqueue: "Queue every trigger occurrence, even if the automation is already running.",
  skip_if_active: "Drop new trigger occurrences while a run is still active.",
};
const catchUpPolicyDescriptions: Record<string, string> = {
  skip_missed: "Ignore windows that were missed while the scheduler or automation was paused.",
  enqueue_missed_with_cap: "Catch up missed schedule windows in capped batches after recovery.",
};

type AutomationOutputMode = "create_issue" | "run_only";

type AutomationTemplate = {
  id: string;
  title: string;
  summary: string;
  description: string;
  scheduleCron: string;
  outputMode: AutomationOutputMode;
  icon: typeof Bug;
};

const automationTemplates: AutomationTemplate[] = [
  {
    id: "bug-triage",
    title: "Bug triage",
    summary: "Assess and prioritize new bug reports.",
    scheduleCron: "0 9 * * 1-5",
    outputMode: "create_issue",
    icon: Bug,
    description: [
      "1. List all open issues labeled bug, triage, or backlog that have not been prioritized.",
      "2. Read the issue description, attached screenshots, logs, and latest comments.",
      "3. Assess severity as critical, high, medium, or low based on user impact and scope.",
      "4. Update priority where the evidence is clear, or leave a comment with the recommended priority.",
      "5. Summarize what changed and call out anything that needs human review.",
    ].join("\n"),
  },
  {
    id: "pr-review-reminder",
    title: "PR review reminder",
    summary: "Flag stale pull requests that need review.",
    scheduleCron: "0 10 * * 1-5",
    outputMode: "create_issue",
    icon: GitPullRequest,
    description: [
      "1. Find pull requests waiting for review for more than one business day.",
      "2. Check whether each PR is blocked, failing CI, or missing a clear reviewer.",
      "3. Comment on the related issue or PR with the specific next action.",
      "4. Escalate only PRs that affect active milestone work.",
    ].join("\n"),
  },
  {
    id: "weekly-progress-report",
    title: "Weekly progress report",
    summary: "Compile a concise summary of team progress.",
    scheduleCron: "0 17 * * 1",
    outputMode: "create_issue",
    icon: BarChart3,
    description: [
      "1. Gather issues completed in the past 7 days.",
      "2. Gather issues currently in progress and identify blocked work.",
      "3. Calculate key movement: closed, opened, reopened, and blocked.",
      "4. Write a structured report with sections for completed, in progress, blocked, and risks.",
      "5. Post the report where the board can review it.",
    ].join("\n"),
  },
  {
    id: "dependency-audit",
    title: "Dependency audit",
    summary: "Scan for security and maintenance risks.",
    scheduleCron: "0 11 * * 2",
    outputMode: "create_issue",
    icon: ShieldCheck,
    description: [
      "1. Inspect dependency and lockfile changes since the last audit.",
      "2. Check for known vulnerabilities, deprecated packages, and risky major updates.",
      "3. Separate urgent fixes from routine maintenance.",
      "4. Create follow-up issues only when there is a concrete owner and recommended action.",
    ].join("\n"),
  },
  {
    id: "documentation-check",
    title: "Documentation check",
    summary: "Review recent changes for documentation gaps.",
    scheduleCron: "0 14 * * 3",
    outputMode: "create_issue",
    icon: FileText,
    description: [
      "1. Review merged product or engineering changes from the past week.",
      "2. Identify user-facing docs, contributor docs, or runbooks that are stale or missing.",
      "3. Rank gaps by user impact and likelihood of repeated confusion.",
      "4. Draft precise documentation tasks with file paths and acceptance criteria.",
    ].join("\n"),
  },
  {
    id: "daily-news-digest",
    title: "Daily news digest",
    summary: "Search and summarize relevant updates for the team.",
    scheduleCron: "0 8 * * 1-5",
    outputMode: "create_issue",
    icon: Newspaper,
    description: [
      "1. Search for important market, customer, or platform updates relevant to the organization.",
      "2. Filter out duplicate, speculative, or low-signal items.",
      "3. Summarize each retained item in one paragraph with source and implication.",
      "4. Call out whether any item should become tracked work.",
    ].join("\n"),
  },
];

const blankAutomationTemplate: AutomationTemplate = {
  id: "scratch",
  title: "",
  summary: "Start from scratch.",
  description: [
    "# Goal",
    "What should the agent accomplish?",
    "",
    "# Context",
    "Who is this for? Any constraints?",
    "",
    "# Steps",
    "1. ...",
    "2. ...",
  ].join("\n"),
  scheduleCron: "0 9 * * *",
  outputMode: "create_issue",
  icon: Zap,
};

function autoResizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function formatLastRunTimestamp(value: Date | string | null | undefined) {
  if (!value) return "Never";
  return formatDateTimeSeconds(value);
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function nextAutomationStatus(currentStatus: string, enabled: boolean) {
  if (currentStatus === "archived" && enabled) return "active";
  return enabled ? "active" : "paused";
}

export function Automations() {
  const { selectedOrganizationId, selectedOrganization } = useOrganization();
  const { setBreadcrumbs, setHeaderActions } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);
  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const assigneeSelectorRef = useRef<HTMLButtonElement | null>(null);
  const projectSelectorRef = useRef<HTMLButtonElement | null>(null);
  const [runningAutomationId, setRunningAutomationId] = useState<string | null>(null);
  const [statusMutationAutomationId, setStatusMutationAutomationId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    projectId: "",
    assigneeAgentId: "",
    priority: "medium",
    concurrencyPolicy: "coalesce_if_active",
    catchUpPolicy: "skip_missed",
    scheduleCron: "0 9 * * *",
    outputMode: "create_issue" as AutomationOutputMode,
  });

  const resetDraft = useCallback(() => {
    setDraft({
      title: "",
      description: "",
      projectId: "",
      assigneeAgentId: "",
      priority: "medium",
      concurrencyPolicy: "coalesce_if_active",
      catchUpPolicy: "skip_missed",
      scheduleCron: "0 9 * * *",
      outputMode: "create_issue",
    });
  }, []);

  const openComposer = useCallback((template: AutomationTemplate = blankAutomationTemplate) => {
    setDraft((current) => ({
      ...current,
      title: template.title,
      description: template.description,
      scheduleCron: template.scheduleCron,
      outputMode: template.outputMode,
    }));
    setAdvancedOpen(false);
    setComposerOpen(true);
  }, []);

  useEffect(() => {
    setBreadcrumbs([{ label: "Automations" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setHeaderActions(null);
      return;
    }

    setHeaderActions(
      <Button type="button" size="sm" className="px-4" onClick={() => openComposer()}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Create automation
      </Button>,
    );

    return () => setHeaderActions(null);
  }, [openComposer, selectedOrganizationId, setHeaderActions]);

  const { data: automations, isLoading, error } = useQuery({
    queryKey: queryKeys.automations.list(selectedOrganizationId!),
    queryFn: () => automationsApi.list(selectedOrganizationId!),
    enabled: !!selectedOrganizationId,
  });
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedOrganizationId!),
    queryFn: () => agentsApi.list(selectedOrganizationId!),
    enabled: !!selectedOrganizationId,
  });
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedOrganizationId!),
    queryFn: () => projectsApi.list(selectedOrganizationId!),
    enabled: !!selectedOrganizationId,
  });
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedOrganizationId!),
    queryFn: () => issuesApi.list(selectedOrganizationId!),
    enabled: !!selectedOrganizationId && composerOpen,
  });
  const { data: assigneeOrganizationSkills } = useQuery({
    queryKey: queryKeys.organizationSkills.list(selectedOrganizationId ?? "__none__"),
    queryFn: () => organizationSkillsApi.list(selectedOrganizationId!),
    enabled: Boolean(selectedOrganizationId) && composerOpen && Boolean(draft.assigneeAgentId),
  });
  const { data: assigneeSkillSnapshot } = useQuery({
    queryKey: queryKeys.agents.skills(draft.assigneeAgentId || "__none__"),
    queryFn: () => agentsApi.skills(draft.assigneeAgentId, selectedOrganizationId!),
    enabled: Boolean(selectedOrganizationId) && composerOpen && Boolean(draft.assigneeAgentId),
  });

  useEffect(() => {
    autoResizeTextarea(titleInputRef.current);
  }, [draft.title, composerOpen]);

  const createAutomation = useMutation({
    mutationFn: async () => {
      const automation = await automationsApi.create(selectedOrganizationId!, {
        title: draft.title,
        description: draft.description.trim() || null,
        projectId: draft.projectId || null,
        assigneeAgentId: draft.assigneeAgentId,
        priority: draft.priority,
        concurrencyPolicy: draft.concurrencyPolicy,
        catchUpPolicy: draft.catchUpPolicy,
      });

      if (draft.scheduleCron.trim()) {
        await automationsApi.createTrigger(automation.id, {
          kind: "schedule",
          label: describeSchedule(draft.scheduleCron),
          cronExpression: draft.scheduleCron.trim(),
          timezone: getLocalTimezone(),
        });
      }

      return automation;
    },
    onSuccess: async (automation) => {
      resetDraft();
      setComposerOpen(false);
      setAdvancedOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.automations.list(selectedOrganizationId!) });
      pushToast({
        title: "Automation created",
        body: draft.scheduleCron.trim()
          ? "Schedule trigger is ready. Review the runbook before it goes live."
          : "Add a trigger when you are ready to run it automatically.",
        tone: "success",
      });
      navigate(`/automations/${automation.id}`);
    },
  });

  const updateAutomationStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => automationsApi.update(id, { status }),
    onMutate: ({ id }) => {
      setStatusMutationAutomationId(id);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.automations.list(selectedOrganizationId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.automations.detail(variables.id) }),
      ]);
    },
    onSettled: () => {
      setStatusMutationAutomationId(null);
    },
    onError: (mutationError) => {
      pushToast({
        title: "Failed to update automation",
        body: mutationError instanceof Error ? mutationError.message : "Rudder could not update the automation.",
        tone: "error",
      });
    },
  });

  const runAutomation = useMutation({
    mutationFn: (id: string) => automationsApi.run(id),
    onMutate: (id) => {
      setRunningAutomationId(id);
    },
    onSuccess: async (_, id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.automations.list(selectedOrganizationId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.automations.detail(id) }),
      ]);
    },
    onSettled: () => {
      setRunningAutomationId(null);
    },
    onError: (mutationError) => {
      pushToast({
        title: "Automation run failed",
        body: mutationError instanceof Error ? mutationError.message : "Rudder could not start the automation run.",
        tone: "error",
      });
    },
  });

  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [composerOpen]);
  const assigneeOptions = useMemo<InlineEntityOption[]>(
    () =>
      sortAgentsByRecency(
        (agents ?? []).filter((agent) => agent.status !== "terminated"),
        recentAssigneeIds,
      ).map((agent) => ({
        id: agent.id,
        label: formatChatAgentLabel(agent),
        searchText: `${agent.name} ${agent.role} ${agent.title ?? ""}`,
      })),
    [agents, recentAssigneeIds],
  );
  const projectOptions = useMemo<InlineEntityOption[]>(
    () =>
      (projects ?? []).map((project) => ({
        id: project.id,
        label: project.name,
        searchText: project.description ?? "",
      })),
    [projects],
  );
  const agentById = useMemo(
    () => new Map((agents ?? []).map((agent) => [agent.id, agent])),
    [agents],
  );
  const projectById = useMemo(
    () => new Map((projects ?? []).map((project) => [project.id, project])),
    [projects],
  );
  const currentAssignee = draft.assigneeAgentId ? agentById.get(draft.assigneeAgentId) ?? null : null;
  const currentProject = draft.projectId ? projectById.get(draft.projectId) ?? null : null;
  const skillMentionOptions = useMemo(
    () => buildAgentSkillMentionOptions({
      agent: currentAssignee,
      orgUrlKey: selectedOrganization?.urlKey ?? "organization",
      organizationSkills: assigneeOrganizationSkills,
      skillSnapshot: assigneeSkillSnapshot,
    }),
    [assigneeOrganizationSkills, assigneeSkillSnapshot, currentAssignee, selectedOrganization?.urlKey],
  );
  const mentionOptions = useMemo(
    () => buildMarkdownMentionOptions({
      agents,
      projects,
      issues,
      skillMentionOptions,
    }),
    [agents, issues, projects, skillMentionOptions],
  );
  const isDraftReady = Boolean(draft.title.trim() && draft.assigneeAgentId);

  if (!selectedOrganizationId) {
    return <EmptyState icon={Repeat} message="Select an organization to view automations." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="issues-list" />;
  }

  return (
    <div className="space-y-6">
      <Dialog
        open={composerOpen}
        onOpenChange={(open) => {
          if (!createAutomation.isPending) {
            setComposerOpen(open);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[88vh] gap-0 overflow-hidden rounded-lg border-border/70 p-0 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:max-w-[min(1180px,calc(100vw-2rem))]"
        >
          <div className="flex min-h-0 flex-col">
            <DialogTitle className="sr-only">New autopilot</DialogTitle>
            <DialogDescription className="sr-only">
              Create a recurring automation by writing a runbook and choosing an agent and schedule.
            </DialogDescription>
            <div className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Zap className="h-4 w-4" />
                </span>
                <span className="shrink-0 font-medium">New autopilot</span>
                <span className="hidden text-muted-foreground sm:inline">·</span>
                <span className="hidden truncate text-muted-foreground sm:inline">A recurring AI task</span>
                {selectedOrganization?.name ? (
                  <>
                    <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/70 sm:block" />
                    <span className="hidden truncate text-muted-foreground sm:inline">{selectedOrganization.name}</span>
                  </>
                ) : null}
              </div>
              <TooltipProvider delayDuration={120}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                      aria-label="Automation help"
                    >
                      <CircleHelp className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={8} className="max-w-[320px] px-3 py-2 text-xs leading-5">
                    Start from the runbook. Ownership and schedule keep the recurring work safe.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
              <main className="min-h-0 min-w-0 space-y-4 overflow-y-auto px-4 py-5 sm:px-5 lg:px-8 lg:py-7">
                <textarea
                  ref={titleInputRef}
                  className="min-h-[44px] w-full resize-none overflow-hidden bg-transparent text-[2rem] font-semibold leading-tight outline-none placeholder:text-muted-foreground/55 sm:text-[2.3rem]"
                  placeholder="Autopilot name"
                  rows={1}
                  value={draft.title}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, title: event.target.value }));
                    autoResizeTextarea(event.target);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      descriptionEditorRef.current?.focus();
                      return;
                    }
                    if (event.key === "Tab" && !event.shiftKey) {
                      event.preventDefault();
                      descriptionEditorRef.current?.focus();
                    }
                  }}
                  autoFocus
                />

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-muted-foreground">Runbook</span>
                    <span className="text-muted-foreground">Read by the agent on every run</span>
                  </div>
                  <MarkdownEditor
                    ref={descriptionEditorRef}
                    value={draft.description}
                    onChange={(description) => setDraft((current) => ({ ...current, description }))}
                    mentions={mentionOptions}
                    placeholder="# Goal&#10;What should the agent accomplish?&#10;&#10;# Steps&#10;1. ..."
                    bordered
                    className="bg-background/40"
                    contentClassName="min-h-[320px] text-[15px] leading-7 text-foreground/90 md:min-h-[430px]"
                    onSubmit={() => {
                      if (!createAutomation.isPending && isDraftReady) {
                        createAutomation.mutate();
                      }
                    }}
                  />
                </div>
              </main>

              <aside className="min-w-0 space-y-6 border-t border-border/60 px-4 py-5 sm:px-5 lg:border-l lg:border-t-0 lg:px-6 lg:py-7">
                <section className="space-y-2.5">
                  <h2 className="text-xs font-medium text-muted-foreground">Agent</h2>
                  <div
                    data-testid="automation-composer-assignee-pill"
                    className="rounded-md border border-border/80 bg-background/50"
                  >
                    <InlineEntitySelector
                      ref={assigneeSelectorRef}
                      value={draft.assigneeAgentId}
                      options={assigneeOptions}
                      placeholder="Select agent"
                      noneLabel="No agent"
                      searchPlaceholder="Search agents..."
                      emptyMessage="No agents found."
                      className="min-h-12 w-full justify-between border-0 bg-transparent px-3 py-2 text-sm font-medium shadow-none hover:bg-accent/50"
                      disablePortal
                      side="bottom"
                      sideOffset={8}
                      onChange={(assigneeAgentId) => {
                        if (assigneeAgentId) trackRecentAssignee(assigneeAgentId);
                        setDraft((current) => ({ ...current, assigneeAgentId }));
                      }}
                      onConfirm={() => projectSelectorRef.current?.focus()}
                      renderTriggerValue={(option) =>
                        option ? (
                          currentAssignee ? (
                            <span className="flex min-w-0 items-center gap-2">
                              <AgentIcon icon={currentAssignee.icon} role={currentAssignee.role} className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">{option.label}</span>
                            </span>
                          ) : (
                            <span className="truncate">{option.label}</span>
                          )
                        ) : (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Bot className="h-4 w-4" />
                            Select agent
                          </span>
                        )
                      }
                      renderOption={(option) => {
                        if (!option.id) return <span className="truncate">{option.label}</span>;
                        const assignee = agentById.get(option.id);
                        return (
                          <>
                            {assignee ? <AgentIcon icon={assignee.icon} role={assignee.role} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                            <span className="truncate">{option.label}</span>
                          </>
                        );
                      }}
                    />
                  </div>
                </section>

                <section className="space-y-2.5">
                  <h2 className="text-xs font-medium text-muted-foreground">Output mode</h2>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      className={`flex min-h-14 items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                        draft.outputMode === "create_issue"
                          ? "border-foreground/70 bg-accent/60 text-foreground"
                          : "border-border/70 bg-background/40 text-muted-foreground hover:bg-accent/40"
                      }`}
                      onClick={() => setDraft((current) => ({ ...current, outputMode: "create_issue" }))}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">Create issue</span>
                        <span className="block truncate text-xs text-muted-foreground">Each run creates tracked work</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex min-h-14 cursor-not-allowed items-center gap-3 rounded-md border border-border/50 bg-background/30 px-3 py-2 text-left text-muted-foreground opacity-70"
                      disabled
                    >
                      <Radio className="h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">Run only</span>
                        <span className="block truncate text-xs">Silent runs are not available yet</span>
                      </span>
                    </button>
                  </div>
                </section>

                <section className="space-y-2.5">
                  <h2 className="text-xs font-medium text-muted-foreground">Schedule</h2>
                  <ScheduleEditor
                    value={draft.scheduleCron}
                    onChange={(scheduleCron) => setDraft((current) => ({ ...current, scheduleCron }))}
                  />
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {draft.scheduleCron.trim() ? describeSchedule(draft.scheduleCron) : "No schedule set"}
                  </p>
                </section>

                <section className="space-y-2.5">
                  <h2 className="text-xs font-medium text-muted-foreground">Project</h2>
                  <div
                    data-testid="automation-composer-project-pill"
                    className="rounded-md border border-border/80 bg-background/50"
                  >
                    <InlineEntitySelector
                      ref={projectSelectorRef}
                      value={draft.projectId}
                      options={projectOptions}
                      placeholder="No project"
                      noneLabel="No project"
                      searchPlaceholder="Search projects..."
                      emptyMessage="No projects found."
                      className="min-h-10 w-full justify-between border-0 bg-transparent px-3 py-2 text-sm font-medium shadow-none hover:bg-accent/50"
                      disablePortal
                      side="bottom"
                      sideOffset={8}
                      onChange={(projectId) => setDraft((current) => ({ ...current, projectId }))}
                      onConfirm={() => descriptionEditorRef.current?.focus()}
                      renderTriggerValue={(option) =>
                        option && currentProject ? (
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-3.5 w-3.5 shrink-0 rounded-sm"
                              style={projectColorBackgroundStyle(currentProject.color)}
                            />
                            <span className="truncate">{option.label}</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <FolderOpen className="h-4 w-4" />
                            No project
                          </span>
                        )
                      }
                      renderOption={(option) => {
                        if (!option.id) return <span className="truncate">{option.label}</span>;
                        const project = projectById.get(option.id);
                        return (
                          <>
                            <span
                              className="h-3.5 w-3.5 shrink-0 rounded-sm"
                              style={projectColorBackgroundStyle(project?.color)}
                            />
                            <span className="truncate">{option.label}</span>
                          </>
                        );
                      }}
                    />
                  </div>
                </section>

                <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" type="button" className="w-full justify-between">
                      Delivery rules
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="top" sideOffset={10} className="w-[320px] space-y-4 p-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Concurrency</p>
                      <Select
                        value={draft.concurrencyPolicy}
                        onValueChange={(concurrencyPolicy) => setDraft((current) => ({ ...current, concurrencyPolicy }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {concurrencyPolicies.map((value) => (
                            <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-5 text-muted-foreground">{concurrencyPolicyDescriptions[draft.concurrencyPolicy]}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Catch-up</p>
                      <Select
                        value={draft.catchUpPolicy}
                        onValueChange={(catchUpPolicy) => setDraft((current) => ({ ...current, catchUpPolicy }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {catchUpPolicies.map((value) => (
                            <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs leading-5 text-muted-foreground">{catchUpPolicyDescriptions[draft.catchUpPolicy]}</p>
                    </div>
                  </PopoverContent>
                </Popover>
              </aside>
            </div>

            <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="truncate">Once saved, runs automatically until paused.</span>
              </p>
              <div className="flex items-center justify-end gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setComposerOpen(false);
                    setAdvancedOpen(false);
                  }}
                  disabled={createAutomation.isPending}
                >
                  Cancel
                </Button>
                <div className="flex flex-col items-end gap-2">
                  <Button size="sm" onClick={() => createAutomation.mutate()} disabled={createAutomation.isPending || !isDraftReady}>
                    {createAutomation.isPending ? "Creating..." : "Create autopilot"}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                  {createAutomation.isError ? (
                    <p className="text-sm text-destructive">
                      {createAutomation.error instanceof Error ? createAutomation.error.message : "Failed to create automation"}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load automations"}
          </CardContent>
        </Card>
      ) : null}

      <div>
        {(automations ?? []).length === 0 ? (
          <div className="mx-auto flex min-h-[min(680px,calc(100vh-12rem))] max-w-5xl flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md border border-border/70 bg-background/60 text-muted-foreground">
              <Zap className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-semibold">No autopilots yet</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Schedule recurring work for your agents. Pick a use case or start from scratch.
            </p>
            <div
              data-testid="automation-template-grid"
              className="mt-8 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {automationTemplates.map((template) => {
                const TemplateIcon = template.icon;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className="group grid min-h-[116px] grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-md border border-border/70 bg-background/45 p-4 text-left transition-colors hover:border-border hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => openComposer(template)}
                  >
                    <TemplateIcon className="mt-0.5 h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{template.title}</span>
                      <span className="mt-1 block text-sm leading-5 text-muted-foreground">{template.summary}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-5"
              onClick={() => openComposer()}
            >
              <Plus className="h-4 w-4" />
              Start from scratch
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Last run</th>
                  <th className="px-3 py-2 font-medium">Enabled</th>
                  <th className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(automations ?? []).map((automation) => {
                  const enabled = automation.status === "active";
                  const isArchived = automation.status === "archived";
                  const isStatusPending = statusMutationAutomationId === automation.id;
                  return (
                    <tr
                      key={automation.id}
                      className="align-middle border-b border-border transition-colors hover:bg-accent/50 last:border-b-0 cursor-pointer"
                      onClick={() => navigate(`/automations/${automation.id}`)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="min-w-[180px]">
                          <span className="font-medium">
                            {automation.title}
                          </span>
                          {(isArchived || automation.status === "paused") && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {isArchived ? "archived" : "paused"}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {automation.projectId ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span
                              className="shrink-0 h-3 w-3 rounded-sm"
                              style={projectColorBackgroundStyle(projectById.get(automation.projectId)?.color)}
                            />
                            <span className="truncate">{projectById.get(automation.projectId)?.name ?? "Unknown"}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {automation.assigneeAgentId ? (() => {
                          const agent = agentById.get(automation.assigneeAgentId);
                          return agent ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <AgentIcon icon={agent.icon} role={agent.role} className="h-4 w-4 shrink-0" />
                              <span className="truncate">{formatChatAgentLabel(agent)}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unknown</span>
                          );
                        })() : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <span className="tabular-nums">{formatLastRunTimestamp(automation.lastRun?.triggeredAt)}</span>
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                          <ToggleSwitch
                            checked={enabled}
                            size="md"
                            tone="success"
                            aria-label={enabled ? `Disable ${automation.title}` : `Enable ${automation.title}`}
                            disabled={isStatusPending || isArchived}
                            onClick={() =>
                              updateAutomationStatus.mutate({
                                id: automation.id,
                                status: nextAutomationStatus(automation.status, !enabled),
                              })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {isArchived ? "Archived" : enabled ? "On" : "Off"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${automation.title}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/automations/${automation.id}`)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={runningAutomationId === automation.id || isArchived}
                              onClick={() => runAutomation.mutate(automation.id)}
                            >
                              {runningAutomationId === automation.id ? "Running..." : "Run now"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                updateAutomationStatus.mutate({
                                  id: automation.id,
                                  status: enabled ? "paused" : "active",
                                })
                              }
                              disabled={isStatusPending || isArchived}
                            >
                              {enabled ? "Pause" : "Enable"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                updateAutomationStatus.mutate({
                                  id: automation.id,
                                  status: automation.status === "archived" ? "active" : "archived",
                                })
                              }
                              disabled={isStatusPending}
                            >
                              {automation.status === "archived" ? "Restore" : "Archive"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
