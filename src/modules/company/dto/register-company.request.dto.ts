import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RegisterCompanyRequestDto {
  @ApiProperty({ description: 'Company name' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ description: 'Admin username' })
  @IsString()
  @MinLength(4)
  adminUsername!: string;

  @ApiProperty({ description: 'Admin password' })
  @IsString()
  @MinLength(6)
  adminPassword!: string;
}
