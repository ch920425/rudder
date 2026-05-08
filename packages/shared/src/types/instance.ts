export type InstanceLocale = "en" | "zh-CN";

export type InstanceGitIdentitySource = "detected_global" | "override";

export interface InstanceGitIdentitySettings {
  name: string;
  email: string;
  confirmed: boolean;
  source: InstanceGitIdentitySource;
  lastDetectedAt: string | null;
}

export interface InstanceDetectedGitIdentity {
  name: string;
  email: string;
  source: "host_global";
  unsafe: boolean;
}

export type InstanceGitIdentityStatus = "confirmed" | "detected" | "missing" | "unsafe";

export interface InstanceGitIdentityState {
  saved: InstanceGitIdentitySettings | null;
  detected: InstanceDetectedGitIdentity | null;
  effective: InstanceGitIdentitySettings | InstanceDetectedGitIdentity | null;
  status: InstanceGitIdentityStatus;
  warning: string | null;
}

export interface InstanceGeneralSettings {
  censorUsernameInLogs: boolean;
  locale: InstanceLocale;
  gitIdentity: InstanceGitIdentitySettings | null;
}

export interface InstanceNotificationSettings {
  desktopInboxNotifications: boolean;
  desktopDockBadge: boolean;
  desktopIssueNotifications: boolean;
  desktopChatNotifications: boolean;
}

export interface InstanceLangfuseSettings {
  enabled: boolean;
  baseUrl: string;
  publicKey: string;
  environment: string;
  secretKeyConfigured: boolean;
  managedByEnv: boolean;
}

export interface OperatorProfileSettings {
  nickname: string;
  moreAboutYou: string;
}

export type InstancePathPickerSelectionType = "file" | "directory";

export interface InstancePathPickerRequest {
  selectionType: InstancePathPickerSelectionType;
}

export interface InstancePathPickerResult {
  path: string | null;
  cancelled: boolean;
}

export interface InstanceSettings {
  id: string;
  general: InstanceGeneralSettings;
  notifications: InstanceNotificationSettings;
  createdAt: Date;
  updatedAt: Date;
}
