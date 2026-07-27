import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Normalizes every error into one JSON envelope so clients (web + native) parse a
 * single shape: { statusCode, error, message, details? }.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'Something went wrong';
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        message = resp;
      } else if (resp && typeof resp === 'object') {
        const r = resp as Record<string, any>;
        message = Array.isArray(r.message) ? r.message.join(', ') : (r.message ?? exception.message);
        error = r.error ?? exception.name;
        if (r.errors) details = r.errors; // zod flatten() from ZodValidationPipe
      }
      // Prefer the standard reason phrase for the status when we don't have one.
      if (error === 'Internal Server Error') error = HttpStatus[statusCode] ?? error;
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.stack ?? exception.message);
    } else {
      this.logger.error(String(exception));
    }

    res.status(statusCode).json({ statusCode, error, message, ...(details ? { details } : {}) });
  }
}
