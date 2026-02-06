import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyRepository } from './company.repository';
import { CompanyService } from './company.service';

@Module({
  providers: [CompanyRepository, CompanyService],
  controllers: [CompanyController],
})
export class CompanyModule {}
