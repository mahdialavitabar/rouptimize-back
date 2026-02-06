import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';

import { PERMISSIONS } from '../core/auth/shared/constants/permissions';
import { CurrentUser } from '../core/auth/shared/decorators/current-user.decorator';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { Roles } from '../core/auth/shared/roles/roles.decorator';
import { RolesGuard } from '../core/auth/shared/roles/roles.guard';
import { CreateUserRequestDto } from './dto/create-user.request.dto';
import { UpdateUserRequestDto } from './dto/update-user.request.dto';
import { UserService } from './user.service';

@ApiBearerAuth()
@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @Roles(PERMISSIONS.USERS.CREATE)
  create(@Body() dto: CreateUserRequestDto, @CurrentUser() user: JwtUser) {
    return this.userService.create(dto, user);
  }

  @Get()
  @Roles(PERMISSIONS.USERS.READ)
  findAll(@CurrentUser() user: JwtUser) {
    return this.userService.findAll(user);
  }

  @Get(':id')
  @Roles(PERMISSIONS.USERS.READ)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.userService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(PERMISSIONS.USERS.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.userService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(PERMISSIONS.USERS.DELETE)
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.userService.remove(id, user);
  }

  @Patch(':id/avatar')
  @Roles(PERMISSIONS.USERS.UPDATE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async updateAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    const avatarUrl = `/uploads/avatars/${file.filename}`;
    return this.userService.update(id, { imageUrl: avatarUrl } as any, user);
  }
}
