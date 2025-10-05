import 'reflect-metadata';
import {
  Inject,
  Injectable,
  DynamicModule,
  Global,
  Provider,
} from '@nestjs/common';
import { Queue } from './bullmq';

export interface BullRootModuleOptions {
  connection?: Record<string, unknown>;
}

export interface BullQueueOptions {
  name: string;
  defaultJobOptions?: Record<string, unknown>;
}

const QUEUE_TOKEN_PREFIX = 'BullQueue_';
const CONNECTION_TOKEN = 'BULLMQ_CONNECTION';

export function getQueueToken(name: string): string {
  return `${QUEUE_TOKEN_PREFIX}${name}`;
}

@Global()
@Injectable()
class BullConnectionProvider {
  constructor(public readonly options: Record<string, unknown>) {}
}

export class BullModule {
  static forRoot(options: BullRootModuleOptions = {}): DynamicModule {
    return {
      module: BullModule,
      global: true,
      providers: [
        {
          provide: CONNECTION_TOKEN,
          useValue: options.connection ?? {},
        },
        {
          provide: BullConnectionProvider,
          useFactory: (): BullConnectionProvider =>
            new BullConnectionProvider(options.connection ?? {}),
        },
      ],
      exports: [CONNECTION_TOKEN, BullConnectionProvider],
    };
  }

  static registerQueue(...queues: BullQueueOptions[]): DynamicModule {
    const providers: Provider[] = queues.map((queue) => ({
      provide: getQueueToken(queue.name),
      useFactory: () => new Queue(queue.name, queue.defaultJobOptions),
    }));

    const exportTokens: Array<string | symbol> = providers.map(
      (provider) => provider.provide as string | symbol,
    );

    return {
      module: BullModule,
      providers,
      exports: exportTokens,
    };
  }
}

export function InjectQueue(name: string): ParameterDecorator {
  return Inject(getQueueToken(name));
}

export const PROCESSOR_METADATA = 'BULLMQ_PROCESSOR';

export function Processor(queueName: string): ClassDecorator {
  return (target) => {
    Injectable()(target);
    Reflect.defineMetadata(PROCESSOR_METADATA, queueName, target);
  };
}

export abstract class WorkerHost {
  abstract process(job: any): Promise<any>;
}
