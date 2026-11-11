import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ServicesModule } from '../services/services.module';
import { SpecialistsModule } from '../specialists/specialists.module';
import { BookingsRepository } from './bookings.repository';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

@Module({
  imports: [SpecialistsModule, ServicesModule, SchedulingModule],
  controllers: [SlotsController],
  providers: [SlotsService, BookingsRepository],
})
export class BookingsModule {}
