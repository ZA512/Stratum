import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TestDataController } from './test-data.controller';
import { TestDataService } from './test-data.service';

@Module({
  imports: [ConfigModule],
  controllers: [TestDataController],
  providers: [TestDataService],
})
export class TestDataModule {}
