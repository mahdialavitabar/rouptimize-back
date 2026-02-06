import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardSuccessResponse<T> {
  statusCode: number;
  data: T;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, StandardSuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<StandardSuccessResponse<T>> {
    const response = context.switchToHttp().getResponse();
    return next.handle().pipe(
      map((data: T): StandardSuccessResponse<T> => {
        const timestamp = new Date().toISOString();
        if (
          data &&
          typeof data === 'object' &&
          'statusCode' in data &&
          ('data' in data || 'message' in data || 'error' in data)
        ) {
          return {
            ...data,
            timestamp: (data as any).timestamp || timestamp,
          } as StandardSuccessResponse<T>;
        }
        return {
          statusCode: response.statusCode,
          data,
          timestamp,
        };
      }),
    );
  }
}
