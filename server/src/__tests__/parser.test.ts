import { parseQuery, buildSql } from '../query/parser.js';

describe('parseQuery', () => {
  it('parses simple terms', () => {
    expect(parseQuery('hello world')).toEqual([
      { kind: 'term', value: 'hello', negated: false },
      { kind: 'term', value: 'world', negated: false },
    ]);
  });

  it('parses negated terms', () => {
    expect(parseQuery('-spam')).toEqual([
      { kind: 'term', value: 'spam', negated: true },
    ]);
  });

  it('parses quoted phrases', () => {
    expect(parseQuery('"hello world"')).toEqual([
      { kind: 'phrase', value: 'hello world', negated: false },
    ]);
  });

  it('parses negated phrases', () => {
    expect(parseQuery('-"bad phrase"')).toEqual([
      { kind: 'phrase', value: 'bad phrase', negated: true },
    ]);
  });

  it('parses site filter', () => {
    expect(parseQuery('site:example.com')).toEqual([
      { kind: 'filter', name: 'site', value: 'example.com', negated: false },
    ]);
  });

  it('parses inurl filter', () => {
    expect(parseQuery('inurl:docs')).toEqual([
      { kind: 'filter', name: 'inurl', value: 'docs', negated: false },
    ]);
  });

  it('parses intitle filter', () => {
    expect(parseQuery('intitle:test')).toEqual([
      { kind: 'filter', name: 'intitle', value: 'test', negated: false },
    ]);
  });

  it('parses negated filters', () => {
    expect(parseQuery('-site:spam.com')).toEqual([
      { kind: 'filter', name: 'site', value: 'spam.com', negated: true },
    ]);
  });

  it('parses mixed query', () => {
    const tokens = parseQuery('hello site:example.com -"bad stuff" world');
    expect(tokens).toHaveLength(4);
    expect(tokens[0]).toEqual({ kind: 'term', value: 'hello', negated: false });
    expect(tokens[1]).toEqual({ kind: 'filter', name: 'site', value: 'example.com', negated: false });
    expect(tokens[2]).toEqual({ kind: 'phrase', value: 'bad stuff', negated: true });
    expect(tokens[3]).toEqual({ kind: 'term', value: 'world', negated: false });
  });

  it('parses lang filter', () => {
    expect(parseQuery('lang:en')).toEqual([
      { kind: 'filter', name: 'lang', value: 'en', negated: false },
    ]);
  });

  it('parses negated lang filter', () => {
    expect(parseQuery('-lang:de')).toEqual([
      { kind: 'filter', name: 'lang', value: 'de', negated: true },
    ]);
  });

  it('strips unknown prefix and keeps value as term', () => {
    expect(parseQuery('foo:bar')).toEqual([
      { kind: 'term', value: 'bar', negated: false },
    ]);
  });

  it('caps tokens at 32', () => {
    const query = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    const tokens = parseQuery(query);
    expect(tokens).toHaveLength(32);
    expect(tokens[31]).toEqual({ kind: 'term', value: 'word31', negated: false });
  });

  it('returns empty for whitespace-only input', () => {
    expect(parseQuery('   ')).toEqual([]);
  });

  it('returns empty for empty string', () => {
    expect(parseQuery('')).toEqual([]);
  });

  it('ignores empty quoted phrases', () => {
    expect(parseQuery('""')).toEqual([]);
  });
});

describe('buildSql', () => {
  it('builds FTS query from terms', () => {
    const tokens = parseQuery('hello world');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('hello world');
    expect(result.whereClauses).toEqual([]);
    expect(result.params).toEqual([]);
  });

  it('builds negated FTS term', () => {
    const tokens = parseQuery('-spam');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('NOT spam');
  });

  it('builds phrase query', () => {
    const tokens = parseQuery('"exact match"');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('"exact match"');
  });

  it('builds site filter as WHERE clause', () => {
    const tokens = parseQuery('site:example.com');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('');
    expect(result.whereClauses).toEqual(["p.domain LIKE ? ESCAPE '\\'"]);
    expect(result.params).toEqual(['%example.com%']);
  });

  it('builds negated site filter', () => {
    const tokens = parseQuery('-site:example.com');
    const result = buildSql(tokens);
    expect(result.whereClauses).toEqual(["p.domain NOT LIKE ? ESCAPE '\\'"]);
  });

  it('builds inurl filter', () => {
    const tokens = parseQuery('inurl:docs');
    const result = buildSql(tokens);
    expect(result.whereClauses).toEqual(["p.url LIKE ? ESCAPE '\\'"]);
    expect(result.params).toEqual(['%docs%']);
  });

  it('builds intitle as FTS column filter', () => {
    const tokens = parseQuery('intitle:test');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('title:"test"');
  });

  it('sanitizes FTS special characters from terms', () => {
    const tokens = parseQuery('hello* wor{ld} te[st]');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('hello world test');
  });

  it('strips all-special terms', () => {
    const tokens = parseQuery('***');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('');
  });

  it('sanitizes parentheses from terms', () => {
    const tokens = parseQuery('foo(bar)');
    const result = buildSql(tokens);
    expect(result.ftsQuery).not.toContain('(');
    expect(result.ftsQuery).not.toContain(')');
    expect(result.ftsQuery).toBe('foobar');
  });

  it('strips unknown prefix and searches value only', () => {
    const tokens = parseQuery('baz:qux');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('qux');
  });

  it('escapes quotes in phrases', () => {
    const tokens = parseQuery('"hello "world""');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toContain('""');
  });

  it('strips FTS keyword AND from terms', () => {
    const tokens = parseQuery('hello AND world');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('hello world');
  });

  it('strips FTS keyword OR from terms', () => {
    const tokens = parseQuery('hello OR world');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('hello world');
  });

  it('strips FTS keyword NOT from terms', () => {
    const tokens = parseQuery('hello NOT world');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('hello world');
  });

  it('strips FTS keyword NEAR from terms', () => {
    const tokens = parseQuery('hello NEAR world');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('hello world');
  });

  it('strips FTS keywords case-insensitively', () => {
    const tokens = parseQuery('hello and world');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('hello world');
  });

  it('builds lang filter as WHERE clause with exact match', () => {
    const tokens = parseQuery('lang:en');
    const result = buildSql(tokens);
    expect(result.ftsQuery).toBe('');
    expect(result.whereClauses).toEqual(['p.lang = ?']);
    expect(result.params).toEqual(['en']);
  });

  it('builds negated lang filter', () => {
    const tokens = parseQuery('-lang:de');
    const result = buildSql(tokens);
    expect(result.whereClauses).toEqual(['p.lang != ?']);
    expect(result.params).toEqual(['de']);
  });
});
