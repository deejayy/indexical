import { AppError, badRequest, unauthorized, forbidden, notFound } from '../errors.js';

describe('AppError', () => {
  it('creates error with status code and message', () => {
    const err = new AppError(400, 'bad input', 'BAD_REQUEST');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('bad input');
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('code is optional', () => {
    const err = new AppError(500, 'fail');
    expect(err.code).toBeUndefined();
  });
});

describe('factory functions', () => {
  it('badRequest creates 400', () => {
    const err = badRequest('missing field');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('unauthorized creates 401', () => {
    const err = unauthorized('no token');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('forbidden creates 403', () => {
    const err = forbidden('not yours');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('notFound creates 404', () => {
    const err = notFound('page missing');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });
});
