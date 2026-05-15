import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ImageUp,
  Shuffle,
  type LucideIcon,
} from "lucide-react";
import { AGENT_ICON_NAMES, type AgentIconName, type AgentRole } from "@rudderhq/shared";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AGENT_ICONS, getAgentIcon, getDefaultAgentIconForRole } from "../lib/agent-icons";
import {
  createRandomAgentDiceBearIcon,
  getAgentAvatarImageSrc,
  normalizeAgentAvatarIconValue,
} from "../lib/agent-avatar";

export { getAgentAvatarImageSrc } from "../lib/agent-avatar";

const DEFAULT_ICON: AgentIconName = "bot";

interface AgentIconProps {
  icon: string | null | undefined;
  role?: AgentRole | null;
  className?: string;
}

export function AgentIcon({ icon, role, className }: AgentIconProps) {
  const normalized = normalizeAgentAvatarIconValue(icon);
  const effectiveIcon = normalized ?? getDefaultAgentIconForRole(role);
  const imageSrc = getAgentAvatarImageSrc(effectiveIcon);
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt=""
        className={cn("inline-flex rounded-full object-cover", className)}
        loading="lazy"
      />
    );
  }
  const Icon = getAgentIcon(effectiveIcon);
  return <Icon className={className} />;
}

interface AgentIconPickerProps {
  value: string | null | undefined;
  onChange: (icon: string | null) => void;
  onUpload?: (file: File) => void;
  uploadPending?: boolean;
  uploadError?: string | null;
  children: React.ReactNode;
}

export function AgentIconPicker({
  value,
  onChange,
  onUpload,
  uploadPending = false,
  uploadError = null,
  children,
}: AgentIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const entries = AGENT_ICON_NAMES.map((name) => [name, AGENT_ICONS[name]] as const);
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(([name]) => name.includes(q));
  }, [search]);

  function selectIcon(icon: string | null) {
    onChange(icon);
    setOpen(false);
    setSearch("");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file || !onUpload) return;
    onUpload(file);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-foreground">Avatar</div>
            <button
              type="button"
              onClick={() => selectIcon(createRandomAgentDiceBearIcon())}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Random
            </button>
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Search icons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
            <div className="grid max-h-40 grid-cols-7 gap-1 overflow-y-auto">
              {filtered.map(([name, Icon]: readonly [AgentIconName, LucideIcon]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => selectIcon(name)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent",
                    (value ?? DEFAULT_ICON) === name && "bg-accent ring-1 ring-primary",
                  )}
                  title={name}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="col-span-7 py-2 text-center text-xs text-muted-foreground">No icons match</p>
              )}
            </div>
          </div>

          {onUpload ? (
            <div className="grid gap-2 border-t border-border pt-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadPending}
                className="flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ImageUp className="h-4 w-4" />
                {uploadPending ? "Uploading..." : "Upload image"}
              </button>
              {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
