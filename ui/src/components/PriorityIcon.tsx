import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { getPriorityConfig, priorityConfig, priorityValues } from "../lib/priorities";
const barHeights = ["h-1", "h-1.5", "h-2.5", "h-3.5"];


export function PriorityBarsIcon({
  priority,
  className,
}: {
  priority: string;
  className?: string;
}) {
  const config = getPriorityConfig(priority);

  return (
    <span
      data-slot="priority-bars-icon"
      className={cn("inline-flex h-3.5 w-4 items-end gap-[2px]", config.color, className)}
      aria-hidden="true"
    >
      {barHeights.map((height, index) => (
        <span
          key={height}
          className={cn(
            "w-[3px] rounded-[1px] bg-current",
            height,
            index >= config.level && "opacity-25",
          )}
        />
      ))}
    </span>
  );
}

interface PriorityIconProps {
  priority: string;
  onChange?: (priority: string) => void;
  className?: string;
  showLabel?: boolean;
}

export function PriorityIcon({ priority, onChange, className, showLabel }: PriorityIconProps) {
  const [open, setOpen] = useState(false);
  const config = getPriorityConfig(priority);

  const icon = (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        onChange && !showLabel && "cursor-pointer",
        className
      )}
    >
      <PriorityBarsIcon priority={priority} />
    </span>
  );

  if (!onChange) return showLabel ? <span className="inline-flex items-center gap-1.5">{icon}<span className="text-sm">{config.label}</span></span> : icon;

  const trigger = showLabel ? (
    <button type="button" className="inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors">
      {icon}
      <span className="text-sm">{config.label}</span>
    </button>
  ) : icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-44 rounded-2xl p-2" align="start">
        {priorityValues.map((p) => {
          const c = priorityConfig[p]!;
          const selected = p === priority;
          return (
            <button
              key={p}
              type="button"
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/60",
                selected && "bg-muted/80",
              )}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            >
              <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold", c.chipClassName)}>
                <PriorityBarsIcon priority={p} className="text-current" />
                {c.label}
              </span>
              {selected ? <Check className="h-4 w-4 text-muted-foreground" /> : <span className="h-4 w-4" aria-hidden="true" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
