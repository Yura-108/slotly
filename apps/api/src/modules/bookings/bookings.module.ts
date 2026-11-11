import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ServicesModule } from '../services/services.module';
import { SpecialistsModule } from '../specialists/specialists.module';
import { UsersModule } from '../users/users.module';
import { BookingsController } from './bookings.controller';
import { BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

@Module({
  imports: [UsersModule, SpecialistsModule, ServicesModule, SchedulingModule, NotificationsModule],
  controllers: [SlotsController, BookingsController],
  providers: [SlotsService, BookingsService, BookingsRepository],
  exports: [BookingsService],
})
export class BookingsModule {}
