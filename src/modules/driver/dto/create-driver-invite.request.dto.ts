import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDriverInviteRequestDto {
  @ApiProperty({ description: 'Driver ID to create invite for' })
  @IsUUID()
  driverId!: string;

  @ApiPropertyOptional({ description: 'Branch ID for the mobile user' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Expiration date for the invite (ISO string)',
  })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
