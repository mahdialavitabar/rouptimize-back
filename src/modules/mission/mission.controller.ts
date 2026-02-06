import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import { PERMISSIONS } from '../core/auth/shared/constants/permissions';
import { CurrentUser } from '../core/auth/shared/decorators/current-user.decorator';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { Roles } from '../core/auth/shared/roles/roles.decorator';
import { RolesGuard } from '../core/auth/shared/roles/roles.guard';
import { CreateMissionRequestDto } from './dto/create-mission.request.dto';
import { MissionPlanRouteRequestDto } from './dto/plan-route.request.dto';
import { UpdateMissionRequestDto } from './dto/update-mission.request.dto';
import { MissionService } from './mission.service';

@ApiBearerAuth()
@ApiTags('missions')
@Controller('missions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class MissionController {
  constructor(private readonly missionService: MissionService) {}

  @Get('distribution-view')
  @Roles(PERMISSIONS.MISSIONS.READ)
  @ApiOperation({
    summary: 'Get missions grouped/sorted for the distributions UI',
  })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['timeWindow', 'customerName', 'status'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['driver', 'status'] })
  findDistributionView(
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
    @Query('branchId') branchId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.missionService.findDistributionView(user, {
      date,
      branchId,
      sortBy,
      sortOrder,
      groupBy,
    });
  }

  @Get('export')
  @Roles(PERMISSIONS.MISSIONS.READ)
  @ApiOperation({ summary: 'Export missions as CSV' })
  async exportCsv(
    @CurrentUser() user: JwtUser,
    @Query('date') date: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.missionService.exportCsv(user, date, branchId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="missions.csv"');
    return csv;
  }

  @Post('plan-route')
  @Roles(PERMISSIONS.MISSIONS.READ)
  @ApiOperation({ summary: 'Plan a route for missions' })
  planRoute(
    @Body() dto: MissionPlanRouteRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.missionService.planRoute(user, dto);
  }

  @Post('import')
  @Roles(PERMISSIONS.MISSIONS.CREATE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ok =
          file.mimetype === 'text/csv' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.mimetype === 'application/json' ||
          file.originalname.toLowerCase().endsWith('.csv') ||
          file.originalname.toLowerCase().endsWith('.json');
        cb(null, ok);
      },
    }),
  )
  @ApiOperation({ summary: 'Import missions from CSV/JSON' })
  @ApiQuery({ name: 'branchId', required: false })
  importMissions(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.missionService.importMissions(user, file, date, branchId);
  }

  @Post()
  @Roles(PERMISSIONS.MISSIONS.CREATE)
  @ApiOperation({ summary: 'Create a new mission' })
  create(@Body() dto: CreateMissionRequestDto, @CurrentUser() user: JwtUser) {
    return this.missionService.create(dto, user);
  }

  @Get()
  @Roles(PERMISSIONS.MISSIONS.READ)
  @ApiOperation({ summary: 'Get all missions' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({
    name: 'driverId',
    required: false,
    description: 'Filter missions by driver ID',
  })
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
    @Query('branchId') branchId?: string,
    @Query('driverId') driverId?: string,
  ) {
    return this.missionService.findAll(user, date, branchId, driverId);
  }

  @Get(':id')
  @Roles(PERMISSIONS.MISSIONS.READ)
  @ApiOperation({ summary: 'Get mission by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.missionService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(PERMISSIONS.MISSIONS.UPDATE)
  @ApiOperation({ summary: 'Update mission by ID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMissionRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.missionService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(PERMISSIONS.MISSIONS.DELETE)
  @ApiOperation({ summary: 'Delete mission by ID' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.missionService.remove(id, user);
  }
}
