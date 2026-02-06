export const PERMISSIONS = {
  USERS: {
    CREATE: 'users.create',
    READ: 'users.read',
    UPDATE: 'users.update',
    DELETE: 'users.delete',
  },
  ROLES: {
    CREATE: 'roles.create',
    READ: 'roles.read',
    UPDATE: 'roles.update',
    DELETE: 'roles.delete',
  },
  BRANCHES: {
    CREATE: 'branches.create',
    READ: 'branches.read',
    UPDATE: 'branches.update',
    DELETE: 'branches.delete',
  },
  MISSIONS: {
    CREATE: 'missions.create',
    READ: 'missions.read',
    UPDATE: 'missions.update',
    DELETE: 'missions.delete',
  },
  COMPANIES: {
    READ: 'companies.read',
  },
  VEHICLES: {
    CREATE: 'vehicles.create',
    READ: 'vehicles.read',
    UPDATE: 'vehicles.update',
    DELETE: 'vehicles.delete',
  },
  DRIVERS: {
    CREATE: 'drivers.create',
    READ: 'drivers.read',
    UPDATE: 'drivers.update',
    DELETE: 'drivers.delete',
  },
  VEHICLE_DRIVER_ASSIGNMENTS: {
    CREATE: 'vehicl-drivers-assignments.create',
    READ: 'vehicl-drivers-assignments.read',
    UPDATE: 'vehicl-drivers-assignments.update',
    DELETE: 'vehicl-drivers-assignments.delete',
  },
  ROUTES: {
    CREATE: 'routes.create',
    READ: 'routes.read',
    UPDATE: 'routes.update',
    DELETE: 'routes.delete',
    ASSIGN: 'routes.assign',
  },
  MOBILE_USERS: {
    READ: 'mobile-users.read',
    UPDATE: 'mobile-users.update',
    DELETE: 'mobile-users.delete',
  },
} as const;

export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS]];

/**
 * Default permissions granted to all mobile users upon registration.
 * These allow drivers to view and update their assigned missions and routes.
 */
export const DEFAULT_MOBILE_PERMISSIONS = [
  PERMISSIONS.MISSIONS.READ,
  PERMISSIONS.MISSIONS.UPDATE,
  PERMISSIONS.ROUTES.READ,
] as const;

export const DEFAULT_MOBILE_PERMISSIONS_STRING =
  DEFAULT_MOBILE_PERMISSIONS.join(',');
