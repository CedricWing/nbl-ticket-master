import { AppError } from './AppError.js';

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
}
