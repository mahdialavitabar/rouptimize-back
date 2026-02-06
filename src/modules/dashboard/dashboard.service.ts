import { Injectable } from '@nestjs/common';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { DashboardRepository } from './dashboard.repository';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboard: DashboardRepository) {}

  async getStats(user: JwtUser) {
    return this.dashboard.getStats();
  }

  async getRecentActivity(user: JwtUser) {
    return this.dashboard.getRecentActivity();
  }

  async getChartData(user: JwtUser, period: 'day' | 'week' | 'month' | 'year') {
    return this.dashboard.getChartData(period);
  }
}
