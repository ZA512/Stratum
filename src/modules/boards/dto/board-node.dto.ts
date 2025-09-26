```typescript
import { NodeDto } from '../../nodes/dto/node.dto';

export class BoardNodeDto extends NodeDto {
  shortId: number;
  assignments?: Array<{
    userId: string;
    role: string;
  }>;
}
```