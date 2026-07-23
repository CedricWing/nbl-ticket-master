import { AppError } from './AppError.js';

export class BadRequestError extends AppError {
  readonly statusCode = 400;
}
