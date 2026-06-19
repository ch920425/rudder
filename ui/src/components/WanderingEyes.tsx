import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

type WanderingEyesProps = ComponentPropsWithoutRef<"span"> & {
  label?: string;
};

export function WanderingEyes({ className, label = "Loading", ...props }: WanderingEyesProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("wandering-eyes", className)}
      {...props}
    >
      <span className="wandering-eyes__pair" aria-hidden="true">
        <span className="wandering-eyes__eye" />
        <span className="wandering-eyes__eye" />
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
