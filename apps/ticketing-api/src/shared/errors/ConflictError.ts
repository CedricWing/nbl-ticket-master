import { AppError } from './AppError.js';

export class ConflictError extends AppError {
  readonly statusCode = 409;
}
