import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PERMISSIONS } from '../core/auth/shared/constants/permissions';
import { CurrentUser } from '../core/auth/shared/decorators/current-user.decorator';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { Roles } from '../core/auth/shared/roles/roles.decorator';
import { RolesGuard } from '../core/auth/shared/roles/roles.guard';
import { CompanyBalanceService } from '../core/company-balance/company-balance.service';
import { CompanyService } from './company.service';
import { PurchaseCompanyBalanceDto } from './dto/purchase-company-balance.dto';
import { RegisterCompanyRequestDto } from './dto/register-company.request.dto';
import { UpdateCompanyRequestDto } from './dto/update-company.request.dto';

@ApiTags('companies')
@Controller('companies')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly companyBalance: CompanyBalanceService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new company with admin user' })
  create(@Body() dto: RegisterCompanyRequestDto) {
    return this.companyService.createWithAdmin(dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Get()
  @Roles(PERMISSIONS.COMPANIES.READ)
  findAll(@CurrentUser() user: JwtUser) {
    return this.companyService.findAll(user);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Get('me/balance')
  @ApiOperation({ summary: 'Get current company balance' })
  getMyBalance() {
    return this.companyBalance.getForCurrentCompany();
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Post('me/balance/purchase')
  @ApiOperation({ summary: 'Purchase or top-up current company balance' })
  purchaseMyBalance(@Body() dto: PurchaseCompanyBalanceDto) {
    return this.companyBalance.purchaseForCurrentCompany(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Get('me/balance/purchases')
  @ApiOperation({ summary: 'List current company balance purchases' })
  listMyBalancePurchases(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    const parsedOffset = offset ? Number(offset) : undefined;

    return this.companyBalance.listPurchasesForCurrentCompany({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      offset: Number.isFinite(parsedOffset) ? parsedOffset : undefined,
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Get('me/balance/purchase-stats')
  @ApiOperation({ summary: 'Get current company balance purchase stats' })
  getMyBalancePurchaseStats() {
    return this.companyBalance.getPurchaseStatsForCurrentCompany();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Get(':id')
  @Roles(PERMISSIONS.COMPANIES.READ)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.companyService.findOne(id, user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @Roles(PERMISSIONS.COMPANIES.READ)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.companyService.update(id, dto, user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @Roles(PERMISSIONS.COMPANIES.READ)
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.companyService.remove(id, user);
  }
}
