CREATE TYPE "public"."company_balance_type_enum" AS ENUM('per_missions', 'per_vehicles_per_month');--> statement-breakpoint
CREATE TYPE "public"."missions_status_enum" AS ENUM('unassigned', 'assigned', 'inProgress', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."routes_status_enum" AS ENUM('draft', 'planned', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."vehicles_status_enum" AS ENUM('active', 'inactive', 'maintenance');--> statement-breakpoint
CREATE TABLE "branch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"companyId" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "branch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_balance_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companyId" uuid NOT NULL,
	"type" "company_balance_type_enum" NOT NULL,
	"quantity" integer NOT NULL,
	"createdById" uuid,
	"totalAfter" integer,
	"remainingAfter" integer,
	"monthlyLimitAfter" integer,
	"periodStartAfter" timestamp with time zone,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_balance_purchase" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "company_balance" (
	"companyId" uuid PRIMARY KEY NOT NULL,
	"type" "company_balance_type_enum" DEFAULT 'per_missions' NOT NULL,
	"total" integer,
	"remaining" integer,
	"monthlyLimit" integer,
	"periodStart" timestamp with time zone,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_balance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "driver_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"companyId" uuid NOT NULL,
	"branchId" uuid,
	"driverId" uuid NOT NULL,
	"roleId" uuid,
	"usedAt" timestamp with time zone,
	"usedByMobileUserId" uuid,
	"expiresAt" timestamp with time zone,
	"createdById" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "driver_invite_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "driver_invite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text,
	"phone" text,
	"companyId" uuid NOT NULL,
	"branchId" uuid,
	"licenseNumber" text,
	"licenseExpiry" date,
	"startWorkingTime" time,
	"endWorkingTime" time,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdById" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "drivers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companyId" uuid NOT NULL,
	"branchId" uuid,
	"date" date NOT NULL,
	"customerName" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"routeId" uuid,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"deliveryTime" time,
	"startTimeWindow" timestamp with time zone NOT NULL,
	"endTimeWindow" timestamp with time zone NOT NULL,
	"assignmentId" uuid,
	"driverId" uuid,
	"driverName" text,
	"vehicleId" uuid,
	"vehiclePlate" text,
	"status" "missions_status_enum" DEFAULT 'unassigned' NOT NULL,
	"createdById" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "missions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mobile_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"imageUrl" text,
	"companyId" uuid NOT NULL,
	"branchId" uuid,
	"roleId" uuid,
	"driverId" uuid,
	"isSuperAdmin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "mobile_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid,
	"mobileUserId" uuid,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"isRevoked" boolean DEFAULT false NOT NULL,
	"familyId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"authorizations" text,
	"companyId" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "route_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companyId" uuid NOT NULL,
	"routeId" uuid NOT NULL,
	"missionId" uuid NOT NULL,
	"stopOrder" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_missions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companyId" uuid NOT NULL,
	"branchId" uuid,
	"date" date NOT NULL,
	"status" "routes_status_enum" DEFAULT 'draft' NOT NULL,
	"geometry" jsonb,
	"totalDistanceMeters" double precision,
	"totalDurationSeconds" integer,
	"vehicleId" uuid,
	"driverId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "routes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"imageUrl" text,
	"companyId" uuid,
	"branchId" uuid,
	"roleId" uuid,
	"isSuperAdmin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vehicle_driver_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"companyId" uuid NOT NULL,
	"branchId" uuid,
	"driverId" uuid NOT NULL,
	"vehicleId" uuid NOT NULL,
	"startDate" timestamp with time zone NOT NULL,
	"endDate" timestamp with time zone,
	"deletedAt" timestamp with time zone,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicle_driver_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vin" text NOT NULL,
	"plateNumber" text NOT NULL,
	"model" text,
	"year" integer,
	"type" text,
	"startWorkingTime" time,
	"endWorkingTime" time,
	"weightCapacity" double precision,
	"volumeCapacity" double precision,
	"missionCapacity" integer,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"costPerKm" numeric DEFAULT '0' NOT NULL,
	"costPerHour" numeric DEFAULT '0' NOT NULL,
	"startPoint" text,
	"endPoint" text,
	"status" "vehicles_status_enum" DEFAULT 'active' NOT NULL,
	"color" text,
	"companyId" uuid NOT NULL,
	"branchId" uuid,
	"createdById" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mobile_user" ADD CONSTRAINT "mobile_user_driverId_drivers_id_fk" FOREIGN KEY ("driverId") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_mobileUserId_mobile_user_id_fk" FOREIGN KEY ("mobileUserId") REFERENCES "public"."mobile_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_missions" ADD CONSTRAINT "route_missions_routeId_routes_id_fk" FOREIGN KEY ("routeId") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_missions" ADD CONSTRAINT "route_missions_missionId_missions_id_fk" FOREIGN KEY ("missionId") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_user_company_username_uq" ON "mobile_user" USING btree ("companyId","username");--> statement-breakpoint
CREATE UNIQUE INDEX "route_missions_route_mission_uq" ON "route_missions" USING btree ("routeId","missionId");--> statement-breakpoint
CREATE UNIQUE INDEX "route_missions_route_stop_uq" ON "route_missions" USING btree ("routeId","stopOrder");--> statement-breakpoint
CREATE UNIQUE INDEX "route_missions_mission_uq" ON "route_missions" USING btree ("missionId");--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "branch" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "branch"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "branch"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "company_balance_purchase" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "company_balance_purchase"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "company_balance_purchase"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "company_balance" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "company_balance"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "company_balance"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "driver_invite" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "driver_invite"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "driver_invite"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "drivers" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "drivers"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "drivers"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "missions" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "missions"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "missions"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "role" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "role"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "role"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "route_missions" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "route_missions"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "route_missions"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "routes" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "routes"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "routes"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "vehicle_driver_assignments" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "vehicle_driver_assignments"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "vehicle_driver_assignments"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "vehicles" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "vehicles"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "vehicles"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "user" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "user"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "user"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation_company" ON "mobile_user" AS PERMISSIVE FOR ALL TO public USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "mobile_user"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR "mobile_user"."companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
