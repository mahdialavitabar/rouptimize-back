import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateMobileUserRequestDto {
  @ApiPropertyOptional({ description: 'Name of the mobile user' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Email of the mobile user' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number of the mobile user' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Array of permissions for the mobile user',
    example: ['missions.read', 'missions.update', 'routes.read'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({
    description: 'Whether the mobile user is blocked',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;
}
