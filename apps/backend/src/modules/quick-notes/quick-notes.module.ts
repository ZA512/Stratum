import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NodesModule } from '../nodes/nodes.module';
import { UsersModule } from '../users/users.module';
import { QuickNotesController } from './quick-notes.controller';
import { QuickNotesAiService } from './quick-notes-ai.service';
import { QuickNotesService } from './quick-notes.service';

@Module({
  imports: [PrismaModule, NodesModule, UsersModule],
  controllers: [QuickNotesController],
  providers: [QuickNotesService, QuickNotesAiService],
  exports: [QuickNotesService],
})
export class QuickNotesModule {}
