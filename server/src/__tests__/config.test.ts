import { envInt, envLogLevel, config } from '../config.js';

describe('envInt', () => {
  it('returns fallback when env var is undefined', () => {
    const orig = process.env['__TEST_INT'];
    delete process.env['__TEST_INT'];
    expect(envInt('__TEST_INT', 42, 0, 100)).toBe(42);
    process.env['__TEST_INT'] = orig;
  });

  it('parses valid integer', () => {
    process.env['__TEST_INT'] = '8080';
    try {
      expect(envInt('__TEST_INT', 0, 0, 65535)).toBe(8080);
    } finally {
      delete process.env['__TEST_INT'];
    }
  });

  it('throws on non-numeric value', () => {
    process.env['__TEST_INT'] = 'abc';
    try {
      expect(() => envInt('__TEST_INT', 0, 0, 100)).toThrow('must be integer');
    } finally {
      delete process.env['__TEST_INT'];
    }
  });

  it('throws on value below min', () => {
    process.env['__TEST_INT'] = '0';
    try {
      expect(() => envInt('__TEST_INT', 5, 1, 100)).toThrow('must be integer');
    } finally {
      delete process.env['__TEST_INT'];
    }
  });

  it('throws on value above max', () => {
    process.env['__TEST_INT'] = '99999';
    try {
      expect(() => envInt('__TEST_INT', 5, 1, 65535)).toThrow('must be integer');
    } finally {
      delete process.env['__TEST_INT'];
    }
  });

  it('accepts value at min boundary', () => {
    process.env['__TEST_INT'] = '1';
    try {
      expect(envInt('__TEST_INT', 0, 1, 100)).toBe(1);
    } finally {
      delete process.env['__TEST_INT'];
    }
  });

  it('accepts value at max boundary', () => {
    process.env['__TEST_INT'] = '100';
    try {
      expect(envInt('__TEST_INT', 0, 1, 100)).toBe(100);
    } finally {
      delete process.env['__TEST_INT'];
    }
  });
});

describe('envLogLevel', () => {
  it('returns fallback when env var is undefined', () => {
    delete process.env['__TEST_LOG'];
    expect(envLogLevel('__TEST_LOG', 'info')).toBe('info');
  });

  it('accepts valid log levels', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      process.env['__TEST_LOG'] = level;
      expect(envLogLevel('__TEST_LOG', 'info')).toBe(level);
    }
    delete process.env['__TEST_LOG'];
  });

  it('throws on invalid log level', () => {
    process.env['__TEST_LOG'] = 'verbose';
    try {
      expect(() => envLogLevel('__TEST_LOG', 'info')).toThrow('must be one of');
    } finally {
      delete process.env['__TEST_LOG'];
    }
  });
});

describe('config defaults', () => {
  it('has expected default port', () => {
    expect(config.port).toBe(11435);
  });

  it('has expected default host', () => {
    expect(config.host).toBe('127.0.0.1');
  });

  it('has expected default logLevel', () => {
    expect(config.logLevel).toBe('info');
  });

  it('has expected apiVersion', () => {
    expect(config.apiVersion).toBe(1);
  });

  it('has expected maxFieldBytes default', () => {
    expect(config.maxFieldBytes).toBe(2 * 1024 * 1024);
  });

  it('has expected maxBodyBytes default', () => {
    expect(config.maxBodyBytes).toBe(4 * 1024 * 1024);
  });

  it('has expected requestTimeoutMs default', () => {
    expect(config.requestTimeoutMs).toBe(30000);
  });

  it('has expected dedupFetchMultiplier default', () => {
    expect(config.dedupFetchMultiplier).toBe(4);
  });
});
