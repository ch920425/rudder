ALTER TABLE "organization_intelligence_profiles" ALTER COLUMN "status" SET DEFAULT 'disabled';
--> statement-breakpoint
UPDATE "organization_intelligence_profiles"
SET
  "status" = 'disabled',
  "last_error" = 'Runtime chain must be tested before enabling.',
  "updated_at" = now()
WHERE "status" = 'configured' AND "last_verified_at" IS NULL;
