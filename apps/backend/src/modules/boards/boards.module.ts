import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamsModule } from '../teams/teams.module';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [BoardsController],
  providers: [BoardsService],
})
export class BoardsModule {}
