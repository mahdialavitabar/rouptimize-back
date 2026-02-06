import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { CreateSwaggerDoc } from '../../common/swagger/swagger.decorator';
import { CurrentUser } from '../core/auth/shared/decorators/current-user.decorator';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @CreateSwaggerDoc({
    summary: 'Get dashboard statistics',
    description:
      'Retrieves overview statistics for the dashboard including key metrics',
    responses: [
      {
        status: 200,
        description: 'Dashboard statistics retrieved successfully',
      },
      { status: 401, description: 'Unauthorized' },
    ],
  })
  async getStats(@CurrentUser() user: JwtUser) {
    return this.dashboardService.getStats(user);
  }

  @Get('recent-activity')
  async getRecentActivity(@CurrentUser() user: JwtUser) {
    return this.dashboardService.getRecentActivity(user);
  }

  @Get('charts')
  async getChartData(
    @CurrentUser() user: JwtUser,
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'week',
  ) {
    return this.dashboardService.getChartData(user, period);
  }
}
