import { AppError } from './AppError.js';

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
}
