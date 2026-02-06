import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import { CompanyBalanceType } from '../../core/company-balance/company-balance.types';

export class PurchaseCompanyBalanceDto {
  @ApiProperty({ enum: CompanyBalanceType })
  @IsEnum(CompanyBalanceType)
  type!: CompanyBalanceType;

  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(0)
  quantity!: number;
}
