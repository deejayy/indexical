import {
  PAGES_COLUMNS, PAGES_INSERT_SQL, bodyToRow, SEARCH_SELECT,
  COLUMN_TO_BODY, FTS_COLUMNS, BM25_WEIGHTS,
  SEARCH_RESULT_COLUMNS,
} from '../db/schema.js';
import type { IngestBody } from '../types.js';

function makeBody(): IngestBody {
  return {
    url: 'https://example.com',
    domain: 'example.com',
    lang: 'en',
    title: 'Test',
    content: 'body text',
    contentMarkdown: '# body',
    excerpt: 'short',
    author: 'Author',
    siteName: 'Example',
    stableHash: 'abc',
    exactHash: 'def',
    wordCount: 10,
    charCount: 50,
    publishedTime: null,
    modifiedTime: null,
    favicon: null,
    captureReason: 'initial',
    userId: 'user1',
    extensionVersion: '1.0',
    requestId: 'req1',
  };
}

describe('schema', () => {
  describe('PAGES_COLUMNS', () => {
    it('has 20 columns', () => {
      expect(PAGES_COLUMNS).toHaveLength(20);
    });

    it('includes expected insert columns', () => {
      expect(PAGES_COLUMNS).toContain('url');
      expect(PAGES_COLUMNS).toContain('content');
      expect(PAGES_COLUMNS).toContain('user_id');
    });

    it('does not include auto-generated columns', () => {
      expect(PAGES_COLUMNS).not.toContain('id');
      expect(PAGES_COLUMNS).not.toContain('captured_at');
    });
  });

  describe('PAGES_INSERT_SQL', () => {
    it('starts with INSERT INTO pages', () => {
      expect(PAGES_INSERT_SQL).toMatch(/^INSERT INTO pages/);
    });

    it('has matching column and param count', () => {
      const colMatch = PAGES_INSERT_SQL.match(/\(([^)]+)\) VALUES/);
      const paramMatch = PAGES_INSERT_SQL.match(/VALUES \(([^)]+)\)/);
      expect(colMatch).not.toBeNull();
      expect(paramMatch).not.toBeNull();
      const cols = colMatch![1]!.split(',').map((s) => s.trim());
      const params = paramMatch![1]!.split(',').map((s) => s.trim());
      expect(cols).toHaveLength(params.length);
    });
  });

  describe('COLUMN_TO_BODY completeness', () => {
    it('maps every PAGES_COLUMN to a valid IngestBody key', () => {
      const bodyKeys = new Set(Object.keys(makeBody()));
      const mappedKeys = Object.values(COLUMN_TO_BODY);
      for (const key of mappedKeys) {
        expect(bodyKeys).toContain(key);
      }
    });

    it('covers every PAGES_COLUMN', () => {
      const mapped = new Set(Object.keys(COLUMN_TO_BODY));
      for (const col of PAGES_COLUMNS) {
        expect(mapped).toContain(col);
      }
    });
  });

  describe('bodyToRow', () => {
    it('maps camelCase body keys to snake_case columns', () => {
      const row = bodyToRow(makeBody());
      expect(row.url).toBe('https://example.com');
      expect(row.content_markdown).toBe('# body');
      expect(row.site_name).toBe('Example');
      expect(row.stable_hash).toBe('abc');
      expect(row.user_id).toBe('user1');
      expect(row.word_count).toBe(10);
      expect(row.capture_reason).toBe('initial');
    });

    it('preserves null values', () => {
      const row = bodyToRow(makeBody());
      expect(row.published_time).toBeNull();
      expect(row.favicon).toBeNull();
    });

    it('produces a row with exactly PAGES_COLUMNS keys', () => {
      const row = bodyToRow(makeBody());
      const keys = Object.keys(row).sort();
      const expected = [...PAGES_COLUMNS].sort();
      expect(keys).toEqual(expected);
    });

    it('produces no undefined values for a complete body', () => {
      const body = makeBody();
      const row = bodyToRow(body);
      for (const col of PAGES_COLUMNS) {
        expect(col in row).toBe(true);
        expect(row[col]).not.toBeUndefined();
      }
    });
  });

  describe('FTS_COLUMNS', () => {
    it('are all valid PAGES_COLUMNS', () => {
      const pagesSet = new Set<string>(PAGES_COLUMNS);
      for (const col of FTS_COLUMNS) {
        expect(pagesSet).toContain(col);
      }
    });

    it('BM25_WEIGHTS length matches FTS_COLUMNS length', () => {
      expect(BM25_WEIGHTS).toHaveLength(FTS_COLUMNS.length);
    });
  });

  describe('SEARCH_RESULT_COLUMNS', () => {
    it('contains p. prefix for all columns in SEARCH_SELECT', () => {
      const parts = SEARCH_SELECT.split(',').map((s) => s.trim());
      for (const part of parts) {
        expect(part).toMatch(/^p\.\w+$/);
      }
    });

    it('includes id and captured_at', () => {
      expect(SEARCH_SELECT).toContain('p.id');
      expect(SEARCH_SELECT).toContain('p.captured_at');
    });

    it('all columns exist in pages table schema', () => {
      const allColumns = new Set<string>([...PAGES_COLUMNS, 'id', 'captured_at']);
      for (const col of SEARCH_RESULT_COLUMNS) {
        expect(allColumns).toContain(col);
      }
    });
  });
});
