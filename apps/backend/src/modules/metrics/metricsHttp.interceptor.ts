import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsHttpInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!this.metrics.isEnabled()) {
      return next.handle();
    }
  const http = context.switchToHttp();
  const req = http.getRequest<any>();
    const method = (req.method || 'UNKNOWN').toUpperCase();
    const start = process.hrtime();

    return next.handle().pipe(
      tap({
        next: () => this.finish(http.getResponse(), method, req.route?.path, start),
        error: () => this.finish(http.getResponse(), method, req.route?.path, start, true),
      }),
    );
  }

  private finish(res: any, method: string, route: string | undefined, start: [number, number], isError = false) {
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    const status = res?.statusCode ?? 0;
    const usedRoute = route || 'unmatched';
    this.metrics.recordHttp(method, usedRoute, status, durationSeconds, isError);
  }
}
