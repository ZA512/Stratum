import { ApiProperty } from '@nestjs/swagger';
import { NodeBreadcrumbItemDto } from './node-breadcrumb-item.dto';

export class NodeBreadcrumbDto {
  @ApiProperty({ type: NodeBreadcrumbItemDto, isArray: true })
  items!: NodeBreadcrumbItemDto[];
}
