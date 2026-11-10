import { Module } from '@nestjs/common';
import { SpecialistsModule } from '../specialists/specialists.module';
import { MyServicesController, PublicServicesController } from './services.controller';
import { ServicesRepository } from './services.repository';
import { ServicesService } from './services.service';

@Module({
  imports: [SpecialistsModule],
  controllers: [MyServicesController, PublicServicesController],
  providers: [ServicesService, ServicesRepository],
  exports: [ServicesService],
})
export class ServicesModule {}
