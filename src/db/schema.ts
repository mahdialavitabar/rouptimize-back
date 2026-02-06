import { relations, sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * ============================================================================
 * MULTI-TENANCY: DATABASE ROLE FOR RLS
 * ============================================================================
 *
 * This role is used for all application queries and has RLS enforced.
 * It does NOT have BYPASSRLS privilege, ensuring tenant isolation.
 *
 * The role is automatically created by the PostgreSQL initialization script:
 * infra/postgres/init.sql (runs when postgres container first starts)
 *
 * Marked as .existing() to exclude from Drizzle migrations since it's
 * created outside of Drizzle's migration system.
 */
export const rlsRole = pgRole('rouptimize_app_rls').existing();

/**
 * ============================================================================
 * MULTI-TENANCY: ROW-LEVEL SECURITY (RLS) POLICY
 * ============================================================================
 *
 * This function creates a PostgreSQL RLS policy that enforces tenant isolation
 * at the database level. It's the core of our multi-tenancy security model.
 *
 * HOW IT WORKS:
 * 1. Every tenant-scoped table has a `companyId` column
 * 2. This policy is applied to each such table via `.enableRLS()`
 * 3. PostgreSQL automatically filters rows based on session variables:
 *    - `app.current_company_id`: The authenticated user's company
 *    - `app.is_superadmin`: Bypass flag for super administrators
 *
 * THE POLICY LOGIC:
 * - If `app.is_superadmin = 'true'` → Allow access to ALL rows (bypass)
 * - Otherwise → Only allow rows where `companyId` matches `app.current_company_id`
 *
 * WHY THIS APPROACH:
 * - Security at database level (impossible to bypass from application code)
 * - No need for WHERE clauses in every query - PostgreSQL handles it
 * - Works for SELECT, INSERT, UPDATE, DELETE (for: 'all')
 * - Defense in depth - even if app code has bugs, data stays isolated
 *
 * PREREQUISITES:
 * - Session variables must be SET before any query (done in interceptor)
 * - Database role must have RLS enforced (not BYPASSRLS)
 *
 * @param companyIdColumn - The column reference for the company ID
 * @returns A pgPolicy configuration for Drizzle ORM
 */
const tenantIsolationCompanyPolicy = (companyIdColumn: AnyPgColumn) =>
  pgPolicy('tenant_isolation_company', {
    for: 'all',
    to: 'public',
    using: sql`COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR ${companyIdColumn} = NULLIF(current_setting('app.current_company_id', true), '')::uuid`,
    withCheck: sql`COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR ${companyIdColumn} = NULLIF(current_setting('app.current_company_id', true), '')::uuid`,
  });

export const vehicleStatusEnum = pgEnum('vehicles_status_enum', [
  'active',
  'inactive',
  'maintenance',
]);

export const missionStatusEnum = pgEnum('missions_status_enum', [
  'unassigned',
  'assigned',
  'inProgress',
  'delivered',
]);

export const routeStatusEnum = pgEnum('routes_status_enum', [
  'draft',
  'planned',
  'in_progress',
  'completed',
  'delayed',
]);

export const companyBalanceTypeEnum = pgEnum('company_balance_type_enum', [
  'per_missions',
  'per_vehicles_per_month',
]);

export const companies = pgTable('company', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const companyBalances = pgTable(
  'company_balance',
  {
    companyId: uuid('companyId').primaryKey().notNull(),
    type: companyBalanceTypeEnum('type').notNull().default('per_missions'),
    total: integer('total'),
    remaining: integer('remaining'),
    monthlyLimit: integer('monthlyLimit'),
    periodStart: timestamp('periodStart', { withTimezone: true }),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (t) => [tenantIsolationCompanyPolicy(t.companyId)],
).enableRLS();

export const companyBalancePurchases = pgTable(
  'company_balance_purchase',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('companyId').notNull(),
    type: companyBalanceTypeEnum('type').notNull(),
    quantity: integer('quantity').notNull(),
    createdById: uuid('createdById'),
    totalAfter: integer('totalAfter'),
    remainingAfter: integer('remainingAfter'),
    monthlyLimitAfter: integer('monthlyLimitAfter'),
    periodStartAfter: timestamp('periodStartAfter', { withTimezone: true }),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    index('company_balance_purchase_company_idx').on(t.companyId),
  ],
).enableRLS();

export const branches = pgTable(
  'branch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    companyId: uuid('companyId'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deletedAt'),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    index('branch_company_idx').on(t.companyId),
  ],
).enableRLS();

export const roles = pgTable(
  'role',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    authorizations: text('authorizations'),
    companyId: uuid('companyId'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deletedAt'),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    index('role_company_idx').on(t.companyId),
  ],
).enableRLS();

export const users = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name'),
    username: text('username').notNull(),
    password: text('password').notNull(),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    imageUrl: text('imageUrl'),
    companyId: uuid('companyId'),
    branchId: uuid('branchId'),
    roleId: uuid('roleId'),
    isSuperAdmin: boolean('isSuperAdmin').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deletedAt'),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    index('user_company_idx').on(t.companyId),
    index('user_email_idx').on(t.email),
    index('user_username_idx').on(t.username),
  ],
).enableRLS();

export const mobileUsers = pgTable(
  'mobile_user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name'),
    username: text('username').notNull(),
    password: text('password').notNull(),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    imageUrl: text('imageUrl'),
    companyId: uuid('companyId').notNull(),
    branchId: uuid('branchId'),
    roleId: uuid('roleId'),
    driverId: uuid('driverId').references(() => drivers.id, {
      onDelete: 'set null',
    }),
    /** Comma-separated permissions string (e.g., "missions.read,missions.update,routes.read") */
    permissions: text('permissions'),
    /** Whether the mobile user is blocked from accessing the system */
    isBlocked: boolean('isBlocked').notNull().default(false),
    isSuperAdmin: boolean('isSuperAdmin').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deletedAt'),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    uniqueIndex('mobile_user_company_username_uq').on(t.companyId, t.username),
    index('mobile_user_driver_idx').on(t.driverId),
  ],
).enableRLS();

export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vin: text('vin').notNull(),
    plateNumber: text('plateNumber').notNull(),
    model: text('model'),
    year: integer('year'),
    type: text('type'),
    startWorkingTime: time('startWorkingTime'),
    endWorkingTime: time('endWorkingTime'),
    weightCapacity: doublePrecision('weightCapacity'),
    volumeCapacity: doublePrecision('volumeCapacity'),
    missionCapacity: integer('missionCapacity'),
    skills: text('skills').array().notNull().default([]),
    costPerKm: numeric('costPerKm').notNull().default('0'),
    costPerHour: numeric('costPerHour').notNull().default('0'),
    startPoint: text('startPoint'),
    endPoint: text('endPoint'),
    status: vehicleStatusEnum('status').notNull().default('active'),
    color: text('color'),
    companyId: uuid('companyId').notNull(),
    branchId: uuid('branchId'),
    createdById: uuid('createdById'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deletedAt'),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    index('vehicle_company_idx').on(t.companyId),
    index('vehicle_branch_idx').on(t.branchId),
    index('vehicle_status_idx').on(t.status),
  ],
).enableRLS();

export const drivers = pgTable(
  'drivers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    name: text('name'),
    phone: text('phone'),
    companyId: uuid('companyId').notNull(),
    branchId: uuid('branchId'),
    licenseNumber: text('licenseNumber'),
    licenseExpiry: date('licenseExpiry', { mode: 'date' }),
    startWorkingTime: time('startWorkingTime'),
    endWorkingTime: time('endWorkingTime'),
    isActive: boolean('isActive').notNull().default(true),
    createdById: uuid('createdById'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
    deletedAt: timestamp('deletedAt'),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    index('driver_company_idx').on(t.companyId),
    index('driver_branch_idx').on(t.branchId),
    index('driver_user_idx').on(t.userId),
  ],
).enableRLS();

export const vehicleDriverAssignments = pgTable(
  'vehicle_driver_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('companyId').notNull(),
    branchId: uuid('branchId'),
    driverId: uuid('driverId').notNull(),
    vehicleId: uuid('vehicleId').notNull(),
    startDate: timestamp('startDate', { withTimezone: true }).notNull(),
    endDate: timestamp('endDate', { withTimezone: true }),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    index('vda_company_idx').on(t.companyId),
    index('vda_vehicle_idx').on(t.vehicleId),
    index('vda_driver_idx').on(t.driverId),
    index('vda_date_range_idx').on(t.startDate, t.endDate),
  ],
).enableRLS();

export const routes = pgTable(
  'routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('companyId').notNull(),
    branchId: uuid('branchId'),
    date: date('date').notNull(),
    name: text('name').notNull().default(''),
    description: text('description').notNull().default(''),
    status: routeStatusEnum('status').notNull().default('draft'),
    geometry: jsonb('geometry'),
    totalDistanceMeters: doublePrecision('totalDistanceMeters'),
    totalDurationSeconds: integer('totalDurationSeconds'),
    vehicleId: uuid('vehicleId'),
    driverId: uuid('driverId'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
    deletedAt: timestamp('deletedAt'),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    index('route_company_idx').on(t.companyId),
    index('route_date_idx').on(t.date),
    index('route_status_idx').on(t.status),
    index('route_vehicle_idx').on(t.vehicleId),
    index('route_driver_idx').on(t.driverId),
  ],
).enableRLS();

export const routeMissions = pgTable(
  'route_missions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('companyId').notNull(),
    routeId: uuid('routeId')
      .notNull()
      .references(() => routes.id, { onDelete: 'cascade' }),
    missionId: uuid('missionId')
      .notNull()
      .references(() => missions.id, { onDelete: 'cascade' }),
    stopOrder: integer('stopOrder').notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    uniqueIndex('route_missions_route_mission_uq').on(t.routeId, t.missionId),
    uniqueIndex('route_missions_route_stop_uq').on(t.routeId, t.stopOrder),
    uniqueIndex('route_missions_mission_uq').on(t.missionId),
  ],
).enableRLS();

//start / end location to missions?
export const missions = pgTable(
  'missions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('companyId').notNull(),
    branchId: uuid('branchId'),
    date: date('date').notNull(),
    customerName: varchar('customerName', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    address: text('address').notNull(),
    routeId: uuid('routeId'),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    deliveryTime: time('deliveryTime'),
    startTimeWindow: timestamp('startTimeWindow', {
      withTimezone: true,
    }).notNull(),
    endTimeWindow: timestamp('endTimeWindow', { withTimezone: true }).notNull(),
    assignmentId: uuid('assignmentId'),
    driverId: uuid('driverId'),
    driverName: text('driverName'),
    vehicleId: uuid('vehicleId'),
    vehiclePlate: text('vehiclePlate'),
    status: missionStatusEnum('status').notNull().default('unassigned'),
    createdById: uuid('createdById'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
    deletedAt: timestamp('deletedAt'),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    index('mission_company_idx').on(t.companyId),
    index('mission_date_idx').on(t.date),
    index('mission_status_idx').on(t.status),
    index('mission_route_idx').on(t.routeId),
    index('mission_driver_idx').on(t.driverId),
    index('mission_vehicle_idx').on(t.vehicleId),
  ],
).enableRLS();

export const companyBalancesRelations = relations(
  companyBalances,
  ({ one }) => ({
    company: one(companies, {
      fields: [companyBalances.companyId],
      references: [companies.id],
    }),
  }),
);

export const companyBalancePurchasesRelations = relations(
  companyBalancePurchases,
  ({ one }) => ({
    company: one(companies, {
      fields: [companyBalancePurchases.companyId],
      references: [companies.id],
    }),
    createdBy: one(users, {
      fields: [companyBalancePurchases.createdById],
      references: [users.id],
    }),
  }),
);

export const branchesRelations = relations(branches, ({ many, one }) => ({
  company: one(companies, {
    fields: [branches.companyId],
    references: [companies.id],
  }),
  users: many(users),
  mobileUsers: many(mobileUsers),
  vehicles: many(vehicles),
  drivers: many(drivers),
  routes: many(routes),
  missions: many(missions),
  vehicleDriverAssignments: many(vehicleDriverAssignments),
}));

export const rolesRelations = relations(roles, ({ many, one }) => ({
  company: one(companies, {
    fields: [roles.companyId],
    references: [companies.id],
  }),
  users: many(users),
  mobileUsers: many(mobileUsers),
}));

export const usersRelations = relations(users, ({ one }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  branch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
}));

export const mobileUsersRelations = relations(mobileUsers, ({ one }) => ({
  company: one(companies, {
    fields: [mobileUsers.companyId],
    references: [companies.id],
  }),
  branch: one(branches, {
    fields: [mobileUsers.branchId],
    references: [branches.id],
  }),
  role: one(roles, {
    fields: [mobileUsers.roleId],
    references: [roles.id],
  }),
  driver: one(drivers, {
    fields: [mobileUsers.driverId],
    references: [drivers.id],
  }),
}));

export const vehiclesRelations = relations(vehicles, ({ many, one }) => ({
  company: one(companies, {
    fields: [vehicles.companyId],
    references: [companies.id],
  }),
  branch: one(branches, {
    fields: [vehicles.branchId],
    references: [branches.id],
  }),
  createdBy: one(users, {
    fields: [vehicles.createdById],
    references: [users.id],
  }),
  assignments: many(vehicleDriverAssignments),
  routes: many(routes),
  missions: many(missions),
}));

export const driversRelations = relations(drivers, ({ many, one }) => ({
  company: one(companies, {
    fields: [drivers.companyId],
    references: [companies.id],
  }),
  branch: one(branches, {
    fields: [drivers.branchId],
    references: [branches.id],
  }),
  user: one(users, {
    fields: [drivers.userId],
    references: [users.id],
    relationName: 'driverUser',
  }),
  mobileUsers: many(mobileUsers),
  createdBy: one(users, {
    fields: [drivers.createdById],
    references: [users.id],
    relationName: 'driverCreatedBy',
  }),
  assignments: many(vehicleDriverAssignments),
  routes: many(routes),
  missions: many(missions),
}));

export const vehicleDriverAssignmentsRelations = relations(
  vehicleDriverAssignments,
  ({ one }) => ({
    company: one(companies, {
      fields: [vehicleDriverAssignments.companyId],
      references: [companies.id],
    }),
    branch: one(branches, {
      fields: [vehicleDriverAssignments.branchId],
      references: [branches.id],
    }),
    driver: one(drivers, {
      fields: [vehicleDriverAssignments.driverId],
      references: [drivers.id],
    }),
    vehicle: one(vehicles, {
      fields: [vehicleDriverAssignments.vehicleId],
      references: [vehicles.id],
    }),
  }),
);

export const routesRelations = relations(routes, ({ many, one }) => ({
  company: one(companies, {
    fields: [routes.companyId],
    references: [companies.id],
  }),
  branch: one(branches, {
    fields: [routes.branchId],
    references: [branches.id],
  }),
  vehicle: one(vehicles, {
    fields: [routes.vehicleId],
    references: [vehicles.id],
  }),
  driver: one(drivers, {
    fields: [routes.driverId],
    references: [drivers.id],
  }),
  missions: many(missions),
  routeMissions: many(routeMissions),
}));

export const routeMissionsRelations = relations(routeMissions, ({ one }) => ({
  company: one(companies, {
    fields: [routeMissions.companyId],
    references: [companies.id],
  }),
  route: one(routes, {
    fields: [routeMissions.routeId],
    references: [routes.id],
  }),
  mission: one(missions, {
    fields: [routeMissions.missionId],
    references: [missions.id],
  }),
}));

export const missionsRelations = relations(missions, ({ one, many }) => ({
  company: one(companies, {
    fields: [missions.companyId],
    references: [companies.id],
  }),
  branch: one(branches, {
    fields: [missions.branchId],
    references: [branches.id],
  }),
  route: one(routes, {
    fields: [missions.routeId],
    references: [routes.id],
  }),
  routeMembership: many(routeMissions),
  driver: one(drivers, {
    fields: [missions.driverId],
    references: [drivers.id],
  }),
  vehicle: one(vehicles, {
    fields: [missions.vehicleId],
    references: [vehicles.id],
  }),
  createdBy: one(users, {
    fields: [missions.createdById],
    references: [users.id],
  }),
}));

export const companiesRelations = relations(companies, ({ many, one }) => ({
  branches: many(branches),
  roles: many(roles),
  users: many(users),
  mobileUsers: many(mobileUsers),
  vehicles: many(vehicles),
  drivers: many(drivers),
  routes: many(routes),
  missions: many(missions),
  vehicleDriverAssignments: many(vehicleDriverAssignments),
  companyBalance: one(companyBalances, {
    fields: [companies.id],
    references: [companyBalances.companyId],
  }),
  companyBalancePurchases: many(companyBalancePurchases),
}));

export const driverInvites = pgTable(
  'driver_invite',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    companyId: uuid('companyId').notNull(),
    branchId: uuid('branchId'),
    driverId: uuid('driverId').notNull(),
    roleId: uuid('roleId'),
    usedAt: timestamp('usedAt', { withTimezone: true }),
    usedByMobileUserId: uuid('usedByMobileUserId'),
    expiresAt: timestamp('expiresAt', { withTimezone: true }),
    createdById: uuid('createdById'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolationCompanyPolicy(t.companyId),
    index('driver_invite_company_idx').on(t.companyId),
    index('driver_invite_driver_idx').on(t.driverId),
  ],
).enableRLS();

export const driverInvitesRelations = relations(driverInvites, ({ one }) => ({
  company: one(companies, {
    fields: [driverInvites.companyId],
    references: [companies.id],
  }),
  branch: one(branches, {
    fields: [driverInvites.branchId],
    references: [branches.id],
  }),
  driver: one(drivers, {
    fields: [driverInvites.driverId],
    references: [drivers.id],
  }),
  role: one(roles, {
    fields: [driverInvites.roleId],
    references: [roles.id],
  }),
  usedByMobileUser: one(mobileUsers, {
    fields: [driverInvites.usedByMobileUserId],
    references: [mobileUsers.id],
  }),
  createdBy: one(users, {
    fields: [driverInvites.createdById],
    references: [users.id],
  }),
}));

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('userId').references(() => users.id),
    mobileUserId: uuid('mobileUserId').references(() => mobileUsers.id),
    tokenHash: text('tokenHash').notNull(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
    isRevoked: boolean('isRevoked').notNull().default(false),
    familyId: uuid('familyId').notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (t) => [
    index('refresh_token_user_idx').on(t.userId),
    index('refresh_token_mobile_user_idx').on(t.mobileUserId),
  ],
);

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
  mobileUser: one(mobileUsers, {
    fields: [refreshTokens.mobileUserId],
    references: [mobileUsers.id],
  }),
}));

export type CompanyRow = typeof companies.$inferSelect;
export type CompanyBalanceRow = typeof companyBalances.$inferSelect;
export type CompanyBalancePurchaseRow =
  typeof companyBalancePurchases.$inferSelect;
export type BranchRow = typeof branches.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type MobileUserRow = typeof mobileUsers.$inferSelect;
export type VehicleRow = typeof vehicles.$inferSelect;
export type DriverRow = typeof drivers.$inferSelect;
export type MissionRow = typeof missions.$inferSelect;
export type RouteRow = typeof routes.$inferSelect;
export type RouteMissionRow = typeof routeMissions.$inferSelect;
export type VehicleDriverAssignmentRow =
  typeof vehicleDriverAssignments.$inferSelect;
export type DriverInviteRow = typeof driverInvites.$inferSelect;

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
