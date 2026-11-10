import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import {
  MySpecialistProfileController,
  PublicSpecialistsController,
} from './specialists.controller';
import { SpecialistsRepository } from './specialists.repository';
import { SpecialistsService } from './specialists.service';

@Module({
  imports: [UsersModule],
  controllers: [MySpecialistProfileController, PublicSpecialistsController],
  providers: [SpecialistsService, SpecialistsRepository],
  exports: [SpecialistsService],
})
export class SpecialistsModule {}
