export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export function badRequest(message: string): AppError {
  return new AppError(400, message, 'BAD_REQUEST');
}

export function unauthorized(message: string): AppError {
  return new AppError(401, message, 'UNAUTHORIZED');
}

export function forbidden(message: string): AppError {
  return new AppError(403, message, 'FORBIDDEN');
}

export function notFound(message: string): AppError {
  return new AppError(404, message, 'NOT_FOUND');
}
