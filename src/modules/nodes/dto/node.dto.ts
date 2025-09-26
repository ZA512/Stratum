```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { Priority, Status } from '@prisma/client';

export class NodeDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  order: number;

  @ApiProperty()
  parentId: string | null;

  @ApiProperty()
  boardId: string;

  @ApiProperty()
  teamId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  dueDate: Date | null;

  @ApiProperty()
  shortId: number;

  @ApiProperty({ enum: Status })
  status: Status;

  @ApiProperty({ enum: Priority })
  priority: Priority;

  @ApiProperty()
  effort: number | null;

  @ApiProperty()
  blockedReminderEmails: string[];

  @ApiProperty()
  blockedReminderIntervalDays: number | null;

  @ApiProperty()
  blockedExpectedUnblockAt: Date | null;

  @ApiProperty()
  metadata: any;

  @ApiProperty()
  children: NodeDto[];

  @ApiProperty()
  parent: NodeDto | null;
}
```