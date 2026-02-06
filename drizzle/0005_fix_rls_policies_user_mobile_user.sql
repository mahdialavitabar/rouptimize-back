-- Fix RLS policies for user and mobile_user tables
-- These tables had RLS enabled but with empty USING/WITH CHECK clauses
-- which blocked ALL access instead of enforcing tenant isolation

-- Ensure RLS is enabled (idempotent)
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mobile_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Drop existing broken policies (if they exist)
DROP POLICY IF EXISTS "tenant_isolation_company" ON "user";--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation_company" ON "mobile_user";--> statement-breakpoint

-- Create correct policy for user table
CREATE POLICY "tenant_isolation_company" ON "user" AS PERMISSIVE FOR ALL TO public
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR "user"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR "user"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );--> statement-breakpoint

-- Create correct policy for mobile_user table
CREATE POLICY "tenant_isolation_company" ON "mobile_user" AS PERMISSIVE FOR ALL TO public
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR "mobile_user"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR "mobile_user"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );
