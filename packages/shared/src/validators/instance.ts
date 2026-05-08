import { z } from "zod";

export const instanceLocaleSchema = z.enum(["en", "zh-CN"]);

export const instanceGitIdentitySourceSchema = z.enum(["detected_global", "override"]);

export const instanceGitIdentitySettingsSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().min(1),
  confirmed: z.boolean().default(true),
  source: instanceGitIdentitySourceSchema,
  lastDetectedAt: z.string().datetime().nullable().default(null),
}).strict();

export const instanceDetectedGitIdentitySchema = z.object({
  name: z.string(),
  email: z.string(),
  source: z.literal("host_global"),
  unsafe: z.boolean(),
}).strict();

export const instanceGitIdentityStatusSchema = z.enum(["confirmed", "detected", "missing", "unsafe"]);

export const instanceGitIdentityStateSchema = z.object({
  saved: instanceGitIdentitySettingsSchema.nullable(),
  detected: instanceDetectedGitIdentitySchema.nullable(),
  effective: z.union([instanceGitIdentitySettingsSchema, instanceDetectedGitIdentitySchema]).nullable(),
  status: instanceGitIdentityStatusSchema,
  warning: z.string().nullable(),
}).strict();

export const patchInstanceGitIdentitySettingsSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  confirmDetected: z.boolean().optional(),
  clear: z.boolean().optional(),
}).strict();

export const instanceGeneralSettingsSchema = z.object({
  censorUsernameInLogs: z.boolean().default(false),
  locale: instanceLocaleSchema.default("en"),
  gitIdentity: instanceGitIdentitySettingsSchema.nullable().default(null),
}).strict();

export const patchInstanceGeneralSettingsSchema = instanceGeneralSettingsSchema.omit({ gitIdentity: true }).partial();

export const instanceNotificationSettingsSchema = z.object({
  desktopInboxNotifications: z.boolean().default(true),
  desktopDockBadge: z.boolean().default(true),
  desktopIssueNotifications: z.boolean().default(true),
  desktopChatNotifications: z.boolean().default(true),
}).strict();

export const patchInstanceNotificationSettingsSchema = instanceNotificationSettingsSchema.partial();

export const instanceLangfuseSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().url().default("http://localhost:3000"),
  publicKey: z.string().default(""),
  environment: z.string().default(""),
  secretKeyConfigured: z.boolean().default(false),
  managedByEnv: z.boolean().default(false),
}).strict();

export const patchInstanceLangfuseSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  baseUrl: z.string().url().optional(),
  publicKey: z.string().optional(),
  secretKey: z.string().optional(),
  environment: z.string().optional(),
  clearSecretKey: z.boolean().optional(),
}).strict();

export const OPERATOR_PROFILE_MORE_ABOUT_YOU_MAX_LENGTH = 8000;

export const operatorProfileSettingsSchema = z.object({
  nickname: z.string().max(80).default(""),
  moreAboutYou: z.string().max(OPERATOR_PROFILE_MORE_ABOUT_YOU_MAX_LENGTH).default(""),
}).strict();

export const patchOperatorProfileSettingsSchema = operatorProfileSettingsSchema.partial();

export const instancePathPickerSelectionTypeSchema = z.enum(["file", "directory"]);

export const instancePathPickerRequestSchema = z.object({
  selectionType: instancePathPickerSelectionTypeSchema,
}).strict();

export const instancePathPickerResultSchema = z.object({
  path: z.string().nullable(),
  cancelled: z.boolean(),
}).strict();

export type InstanceGitIdentitySettings = z.infer<typeof instanceGitIdentitySettingsSchema>;
export type InstanceDetectedGitIdentity = z.infer<typeof instanceDetectedGitIdentitySchema>;
export type InstanceGitIdentityState = z.infer<typeof instanceGitIdentityStateSchema>;
export type PatchInstanceGitIdentitySettings = z.infer<typeof patchInstanceGitIdentitySettingsSchema>;
export type InstanceGeneralSettings = z.infer<typeof instanceGeneralSettingsSchema>;
export type PatchInstanceGeneralSettings = z.infer<typeof patchInstanceGeneralSettingsSchema>;
export type InstanceLangfuseSettings = z.infer<typeof instanceLangfuseSettingsSchema>;
export type PatchInstanceLangfuseSettings = z.infer<typeof patchInstanceLangfuseSettingsSchema>;
export type InstanceLocale = z.infer<typeof instanceLocaleSchema>;
export type OperatorProfileSettings = z.infer<typeof operatorProfileSettingsSchema>;
export type PatchOperatorProfileSettings = z.infer<typeof patchOperatorProfileSettingsSchema>;
export type InstanceNotificationSettings = z.infer<typeof instanceNotificationSettingsSchema>;
export type PatchInstanceNotificationSettings = z.infer<typeof patchInstanceNotificationSettingsSchema>;
export type InstancePathPickerSelectionType = z.infer<typeof instancePathPickerSelectionTypeSchema>;
export type InstancePathPickerRequest = z.infer<typeof instancePathPickerRequestSchema>;
export type InstancePathPickerResult = z.infer<typeof instancePathPickerResultSchema>;
