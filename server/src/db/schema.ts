import type { IngestBody } from '../types.js';

export const PAGES_COLUMNS = [
  'url', 'domain', 'lang', 'title', 'content', 'content_markdown',
  'excerpt', 'author', 'site_name', 'stable_hash', 'exact_hash',
  'word_count', 'char_count', 'published_time', 'modified_time',
  'favicon', 'capture_reason', 'user_id', 'extension_version', 'request_id',
] as const;

export type PagesColumn = (typeof PAGES_COLUMNS)[number];

export const FTS_COLUMNS = ['title', 'content', 'excerpt', 'author', 'site_name'] as const;
export type FtsColumn = (typeof FTS_COLUMNS)[number];

export const BM25_WEIGHTS: readonly number[] & { length: typeof FTS_COLUMNS.length } =
  [10, 1, 5, 3, 2] as const;

export const COLUMN_TO_BODY: Record<PagesColumn, keyof IngestBody> = {
  url: 'url',
  domain: 'domain',
  lang: 'lang',
  title: 'title',
  content: 'content',
  content_markdown: 'contentMarkdown',
  excerpt: 'excerpt',
  author: 'author',
  site_name: 'siteName',
  stable_hash: 'stableHash',
  exact_hash: 'exactHash',
  word_count: 'wordCount',
  char_count: 'charCount',
  published_time: 'publishedTime',
  modified_time: 'modifiedTime',
  favicon: 'favicon',
  capture_reason: 'captureReason',
  user_id: 'userId',
  extension_version: 'extensionVersion',
  request_id: 'requestId',
};

const INSERT_COLS = PAGES_COLUMNS.join(', ');
const INSERT_PARAMS = PAGES_COLUMNS.map((c) => `@${c}`).join(', ');

export const PAGES_INSERT_SQL =
  `INSERT INTO pages (${INSERT_COLS}) VALUES (${INSERT_PARAMS})`;

export function bodyToRow(body: IngestBody): Record<PagesColumn, IngestBody[keyof IngestBody]> {
  const row = {} as Record<PagesColumn, IngestBody[keyof IngestBody]>;
  for (const col of PAGES_COLUMNS) {
    row[col] = body[COLUMN_TO_BODY[col]];
  }
  return row;
}

export const SEARCH_RESULT_COLUMNS = [
  'id', 'url', 'domain', 'lang', 'title', 'excerpt', 'author',
  'site_name', 'favicon', 'word_count', 'capture_reason',
  'published_time', 'captured_at',
] as const;

export type SearchResultColumn = (typeof SEARCH_RESULT_COLUMNS)[number];

export const SEARCH_SELECT =
  SEARCH_RESULT_COLUMNS.map((c) => `p.${c}`).join(', ');
