import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [MeController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
