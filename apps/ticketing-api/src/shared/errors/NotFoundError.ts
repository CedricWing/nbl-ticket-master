import { AppError } from './AppError.js';

export class NotFoundError extends AppError {
  readonly statusCode = 404;
}
