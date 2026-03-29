import Database from 'better-sqlite3';
import { ingestPage, extractSpellfixWords } from '../services/ingest.service.js';
import type { IngestMetrics } from '../services/ingest.service.js';
import { searchPages } from '../services/search.service.js';
import type { SearchMetrics } from '../services/search.service.js';
import { setupTestDb, makeBody } from './helpers/testDb.js';
import type { Logger } from 'pino';

const DEFAULT_SPELLFIX_CFG = { minWordLen: 3, maxWordLen: 40 };

const noop = () => {};
const noopLog = { warn: noop, info: noop, error: noop, debug: noop } as unknown as Logger;
const stubCounter = { inc: noop };

function makeIngestMetrics(): IngestMetrics {
  return { spellfixErrors: stubCounter } as unknown as IngestMetrics;
}

function makeSearchMetrics(): SearchMetrics {
  return { spellfixErrors: stubCounter } as unknown as SearchMetrics;
}

describe('ingestPage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('inserts a new page and returns "inserted"', () => {
    const result = ingestPage(db, makeBody(), false, DEFAULT_SPELLFIX_CFG, noopLog, makeIngestMetrics());
    expect(result).toBe('inserted');
    const count = db.prepare('SELECT COUNT(*) as c FROM pages').get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('returns "duplicate" for same url+hash+user', () => {
    ingestPage(db, makeBody(), false, DEFAULT_SPELLFIX_CFG, noopLog, makeIngestMetrics());
    const result = ingestPage(db, makeBody(), false, DEFAULT_SPELLFIX_CFG, noopLog, makeIngestMetrics());
    expect(result).toBe('duplicate');
    const count = db.prepare('SELECT COUNT(*) as c FROM pages').get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('inserts different URLs as separate pages', () => {
    const m = makeIngestMetrics();
    ingestPage(db, makeBody({ url: 'https://a.com' }), false, DEFAULT_SPELLFIX_CFG, noopLog, m);
    ingestPage(db, makeBody({ url: 'https://b.com' }), false, DEFAULT_SPELLFIX_CFG, noopLog, m);
    const count = db.prepare('SELECT COUNT(*) as c FROM pages').get() as { c: number };
    expect(count.c).toBe(2);
  });

  it('maps all fields correctly', () => {
    const body = makeBody({
      siteName: 'My Site',
      stableHash: 'sHash',
      wordCount: 42,
    });
    ingestPage(db, body, false, DEFAULT_SPELLFIX_CFG, noopLog, makeIngestMetrics());
    const row = db.prepare('SELECT * FROM pages WHERE id = 1').get() as Record<string, unknown>;
    expect(row['site_name']).toBe('My Site');
    expect(row['stable_hash']).toBe('sHash');
    expect(row['word_count']).toBe(42);
  });
});

describe('searchPages', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = setupTestDb();
    const m = makeIngestMetrics();
    ingestPage(db, makeBody({
      url: 'https://example.com/typescript',
      title: 'TypeScript Guide',
      content: 'TypeScript is a typed superset of JavaScript',
      stableHash: 'ts1',
    }), false, DEFAULT_SPELLFIX_CFG, noopLog, m);
    ingestPage(db, makeBody({
      url: 'https://example.com/python',
      title: 'Python Tutorial',
      content: 'Python is a dynamic programming language',
      stableHash: 'py1',
    }), false, DEFAULT_SPELLFIX_CFG, noopLog, m);
    ingestPage(db, makeBody({
      url: 'https://example.com/rust',
      title: 'Rust Programming',
      content: 'Rust is a systems programming language focused on safety',
      stableHash: 'rs1',
    }), false, DEFAULT_SPELLFIX_CFG, noopLog, m);
  });

  afterEach(() => {
    db.close();
  });

  it('finds pages by content keyword', () => {
    const result = searchPages(db, 'TypeScript', 10, { userId: 'user1' }, 4, noopLog, makeSearchMetrics());
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]!.url).toContain('typescript');
  });

  it('returns empty for non-matching query', () => {
    const result = searchPages(db, 'nonexistentxyz', 10, { userId: 'user1' }, 4, noopLog, makeSearchMetrics());
    expect(result.results).toHaveLength(0);
  });

  it('respects k limit', () => {
    const result = searchPages(db, 'programming', 1, { userId: 'user1' }, 4, noopLog, makeSearchMetrics());
    expect(result.results).toHaveLength(1);
  });

  it('filters by user', () => {
    const result = searchPages(db, 'TypeScript', 10, { userId: 'other_user' }, 4, noopLog, makeSearchMetrics());
    expect(result.results).toHaveLength(0);
  });

  it('returns empty for empty query', () => {
    const result = searchPages(db, '', 10, { userId: 'user1' }, 4, noopLog, makeSearchMetrics());
    expect(result.results).toHaveLength(0);
  });

  it('handles site filter', () => {
    const result = searchPages(db, 'site:example.com programming', 10, { userId: 'user1' }, 4, noopLog, makeSearchMetrics());
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('results contain expected fields', () => {
    const result = searchPages(db, 'TypeScript', 10, { userId: 'user1' }, 4, noopLog, makeSearchMetrics());
    const first = result.results[0]!;
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('url');
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('domain');
  });

  it('deduplicates by URL', () => {
    ingestPage(db, makeBody({
      url: 'https://example.com/typescript',
      title: 'TypeScript Guide Updated',
      content: 'TypeScript with new features',
      stableHash: 'ts2',
      exactHash: 'exact_new',
    }), false, DEFAULT_SPELLFIX_CFG, noopLog, makeIngestMetrics());
    const result = searchPages(db, 'TypeScript', 10, { userId: 'user1' }, 4, noopLog, makeSearchMetrics());
    const tsResults = result.results.filter((r) => r.url.includes('typescript'));
    expect(tsResults).toHaveLength(1);
  });
});

describe('extractSpellfixWords', () => {
  const cfg = { minWordLen: 3, maxWordLen: 40 };

  it('extracts words meeting minimum length', () => {
    const words = extractSpellfixWords('hi the world', cfg);
    expect(words).toContain('the');
    expect(words).toContain('world');
    expect(words).not.toContain('hi');
  });

  it('lowercases all words', () => {
    const words = extractSpellfixWords('Hello World', cfg);
    expect(words).toContain('hello');
    expect(words).toContain('world');
    expect(words).not.toContain('Hello');
  });

  it('deduplicates words', () => {
    const words = extractSpellfixWords('hello hello hello', cfg);
    expect(words).toEqual(['hello']);
  });

  it('filters words exceeding max length', () => {
    const longWord = 'a'.repeat(41);
    const words = extractSpellfixWords(`short ${longWord}`, cfg);
    expect(words).toContain('short');
    expect(words).not.toContain(longWord);
  });

  it('handles unicode characters', () => {
    const words = extractSpellfixWords('caf\u00e9 na\u00efve', cfg);
    expect(words).toContain('caf\u00e9');
    expect(words).toContain('na\u00efve');
  });

  it('returns empty for empty text', () => {
    expect(extractSpellfixWords('', cfg)).toEqual([]);
  });

  it('handles hyphens and apostrophes in words', () => {
    const words = extractSpellfixWords("it's well-known", cfg);
    expect(words).toContain("it's");
    expect(words).toContain('well-known');
  });
});
