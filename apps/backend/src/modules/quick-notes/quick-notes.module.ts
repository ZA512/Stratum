import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { QuickNotesController } from './quick-notes.controller';
import { QuickNotesService } from './quick-notes.service';

@Module({
  imports: [PrismaModule],
  controllers: [QuickNotesController],
  providers: [QuickNotesService],
  exports: [QuickNotesService],
})
export class QuickNotesModule {}
