import type { Database } from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Counter } from 'prom-client';
import type { SearchResult, SearchResponse, PageRow } from '../types.js';
import { EPOCH_ZERO } from '../types.js';
import { parseQuery, buildSql } from '../query/parser.js';
import type { Token } from '../query/parser.js';
import { SEARCH_SELECT, BM25_WEIGHTS } from '../db/schema.js';
import type { SearchResultColumn } from '../db/schema.js';

export interface SearchMetrics {
  spellfixErrors: Counter;
}

export interface SearchOptions {
  userId: string;
  from?: string;
  to?: string;
}

const BM25_EXPR = `bm25(pages_fts, ${BM25_WEIGHTS.join(', ')})`;

const SNIPPET_MARK_START = '\x02';
const SNIPPET_MARK_END = '\x03';
const SNIPPET_EXPR =
  `snippet(pages_fts, -1, '${SNIPPET_MARK_START}', '${SNIPPET_MARK_END}', '…', 32)`;

const SPELLFIX_TOP = 3;

function spellfixCandidates(db: Database, word: string, log: Logger, metrics: SearchMetrics): string[] {
  try {
    const rows = db
      .prepare('SELECT word FROM spellfix_vocab WHERE word MATCH ? AND top=?')
      .all(word, SPELLFIX_TOP) as Array<{ word: string }>;
    return rows
      .map((r) => r.word.trim())
      .filter((w) => w.toLowerCase() !== word.toLowerCase() && !w.includes(' '));
  } catch (err) {
    metrics.spellfixErrors.inc();
    log.warn({ err, msg: 'spellfix candidate lookup failed' });
    return [];
  }
}

function termHasFtsMatch(db: Database, word: string): boolean {
  try {
    const row = db
      .prepare('SELECT 1 FROM pages_fts WHERE pages_fts MATCH ? LIMIT 1')
      .get(word);
    return row !== undefined;
  } catch {
    return false;
  }
}

function applyCorrections(
  db: Database,
  tokens: Token[],
  log: Logger,
  metrics: SearchMetrics,
): { corrected: Token[]; corrections: Record<string, string> } {
  const corrections: Record<string, string> = {};
  const corrected = tokens.map((tok): Token => {
    if (tok.kind !== 'term') return tok;
    if (tok.negated) return tok;
    if (termHasFtsMatch(db, tok.value)) return tok;
    const candidates = spellfixCandidates(db, tok.value, log, metrics);
    if (candidates.length === 0) return tok;
    const joined = candidates.join(' OR ');
    corrections[tok.value] = joined;
    return { ...tok, value: joined };
  });
  return { corrected, corrections };
}

type Row = Pick<PageRow, SearchResultColumn> & { raw_bm25: number; snippet: string | null };

interface BaseQuery {
  baseWhere: string;
  baseParams: (string | number)[];
}

function buildBaseQuery(opts: SearchOptions): BaseQuery {
  const fromTs = opts.from ?? EPOCH_ZERO;
  const toTs = opts.to ?? new Date().toISOString();
  return {
    baseWhere: 'p.user_id = ? AND p.captured_at BETWEEN ? AND ?',
    baseParams: [opts.userId, fromTs, toTs],
  };
}

function ftsSearch(
  db: Database, ftsQuery: string, whereClauses: string[], params: (string | number)[],
  base: BaseQuery, limit: number,
): Row[] {
  const filterExtra = whereClauses.length > 0 ? ' AND ' + whereClauses.join(' AND ') : '';
  return db
    .prepare(
      `SELECT ${SEARCH_SELECT}, ${BM25_EXPR} AS raw_bm25, ${SNIPPET_EXPR} AS snippet
       FROM pages_fts JOIN pages p ON p.id = pages_fts.rowid
       WHERE pages_fts MATCH ? AND ${base.baseWhere}${filterExtra}
       ORDER BY raw_bm25 ASC LIMIT ?`,
    )
    .all(ftsQuery, ...base.baseParams, ...params, limit) as Row[];
}

function filterOnlySearch(
  db: Database, whereClauses: string[], params: (string | number)[],
  base: BaseQuery, limit: number,
): Row[] {
  const where = whereClauses.length > 0
    ? base.baseWhere + ' AND ' + whereClauses.join(' AND ')
    : base.baseWhere;
  return db
    .prepare(
      `SELECT ${SEARCH_SELECT}, 0.5 AS raw_bm25, NULL AS snippet
       FROM pages p WHERE ${where}
       ORDER BY p.captured_at DESC LIMIT ?`,
    )
    .all(...base.baseParams, ...params, limit) as Row[];
}

function execSearch(db: Database, tokens: Token[], k: number, opts: SearchOptions, multiplier: number): Row[] {
  const { ftsQuery, whereClauses, params } = buildSql(tokens);
  if (!ftsQuery && whereClauses.length === 0) return [];

  const base = buildBaseQuery(opts);
  const limit = k * multiplier;

  if (ftsQuery) return ftsSearch(db, ftsQuery, whereClauses, params, base, limit);
  return filterOnlySearch(db, whereClauses, params, base, limit);
}

function deduplicateByUrl(rows: Row[]): Row[] {
  const best = new Map<string, Row>();
  for (const row of rows) {
    const existing = best.get(row.url);
    if (!existing || row.raw_bm25 < existing.raw_bm25) {
      best.set(row.url, row);
    }
  }
  return [...best.values()].sort((a, b) => a.raw_bm25 - b.raw_bm25);
}

const n = <T>(v: T | undefined | null): T | null => v ?? null;

function mapRow(r: Row): SearchResult {
  return {
    id: r.id,
    url: r.url,
    title: n(r.title),
    snippet: n(r.snippet),
    favicon: n(r.favicon),
    domain: n(r.domain),
    siteName: n(r.site_name),
    author: n(r.author),
    excerpt: n(r.excerpt),
    capturedAt: r.captured_at,
    publishedTime: n(r.published_time),
    wordCount: n(r.word_count),
    lang: n(r.lang),
    captureReason: n(r.capture_reason),
  };
}

function rowsToResults(rows: Row[], k: number): SearchResult[] {
  return deduplicateByUrl(rows).slice(0, k).map(mapRow);
}

export function searchPages(
  db: Database, query: string, k: number, opts: SearchOptions, multiplier: number,
  log: Logger, metrics: SearchMetrics,
): SearchResponse {
  const tokens = parseQuery(query);
  if (tokens.length === 0) return { results: [] };

  const rows = execSearch(db, tokens, k, opts, multiplier);
  if (rows.length > 0) {
    return { results: rowsToResults(rows, k) };
  }

  const { corrected, corrections } = applyCorrections(db, tokens, log, metrics);
  if (Object.keys(corrections).length === 0) return { results: [] };

  const fallbackRows = execSearch(db, corrected, k, opts, multiplier);
  return {
    results: rowsToResults(fallbackRows, k),
    corrections,
  };
}
