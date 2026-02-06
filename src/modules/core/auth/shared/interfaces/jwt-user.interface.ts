import type { AuthActorType } from '../types/auth-actor.type';

export interface JwtUser {
  /** Token subject id. For web: user.id. For mobile: mobile_user.id */
  userId: string;
  username: string;
  companyId?: string;
  branchId?: string;
  role?: {
    name: string;
    authorizations: string[];
  };
  isSuperAdmin?: boolean;
  actorType?: AuthActorType;
  driverId?: string;
}
