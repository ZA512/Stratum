export interface RepeatOptions {
  pattern?: string;
  tz?: string;
  every?: number;
}

export interface AddJobOptions {
  jobId?: string;
  repeat?: RepeatOptions;
  removeOnComplete?: number | boolean;
  removeOnFail?: number | boolean;
}

export class Job<T = any> {
  readonly timestamp: number;

  constructor(
    public readonly data: T,
    timestamp?: number,
  ) {
    this.timestamp = timestamp ?? Date.now();
  }
}

export class Queue<T = any> {
  constructor(
    public readonly name: string,
    public readonly defaultJobOptions?: Record<string, unknown>,
  ) {}

  // Stub implementation: in real BullMQ this would enqueue the job in Redis.
  add(name: string, data: T, options?: AddJobOptions): Promise<Job<T>> {
    void name;
    void options;
    return Promise.resolve(new Job<T>(data));
  }
}
