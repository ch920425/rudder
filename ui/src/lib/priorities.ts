import { priorityColor, priorityColorDefault } from "./status-colors";

export type PriorityValue = "critical" | "high" | "medium" | "low";

export type PriorityVisualConfig = {
  value: PriorityValue;
  label: string;
  level: number;
  color: string;
  chipClassName: string;
};

export const priorityConfig: Record<PriorityValue, PriorityVisualConfig> = {
  critical: {
    value: "critical",
    label: "Urgent",
    level: 4,
    color: priorityColor.critical ?? priorityColorDefault,
    chipClassName: "bg-orange-600 text-white dark:bg-orange-500 dark:text-white",
  },
  high: {
    value: "high",
    label: "High",
    level: 3,
    color: priorityColor.high ?? priorityColorDefault,
    chipClassName: "bg-orange-500 text-white dark:bg-orange-400 dark:text-white",
  },
  medium: {
    value: "medium",
    label: "Medium",
    level: 2,
    color: priorityColor.medium ?? priorityColorDefault,
    chipClassName: "bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300",
  },
  low: {
    value: "low",
    label: "Low",
    level: 1,
    color: priorityColor.low ?? priorityColorDefault,
    chipClassName: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300",
  },
};

export const priorityValues: PriorityValue[] = ["critical", "high", "medium", "low"];
export const priorityOptions = priorityValues.map((priority) => priorityConfig[priority]);

function titleCasePriority(priority: string): string {
  return priority.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getPriorityConfig(priority: string): PriorityVisualConfig {
  return priorityConfig[priority as PriorityValue] ?? priorityConfig.medium;
}

export function formatPriorityLabel(priority: string): string {
  return priorityConfig[priority as PriorityValue]?.label ?? titleCasePriority(priority);
}
