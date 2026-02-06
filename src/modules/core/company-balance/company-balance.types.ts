export enum CompanyBalanceType {
  PER_MISSIONS = 'per_missions',
  PER_VEHICLES_PER_MONTH = 'per_vehicles_per_month',
}

export type CompanyBalanceAction = 'mission_create' | 'vehicle_create';
