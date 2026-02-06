-- Add permissions and isBlocked columns to mobile_user table
ALTER TABLE "mobile_user" ADD COLUMN IF NOT EXISTS "permissions" text;--> statement-breakpoint
ALTER TABLE "mobile_user" ADD COLUMN IF NOT EXISTS "isBlocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Set default permissions for existing mobile users
UPDATE "mobile_user"
SET "permissions" = 'missions.read,missions.update,routes.read'
WHERE "permissions" IS NULL;
