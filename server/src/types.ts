export interface IngestBody {
  url: string;
  domain: string;
  lang: string;
  title: string;
  content: string;
  contentMarkdown: string | null;
  excerpt: string | null;
  author: string | null;
  siteName: string | null;
  stableHash: string;
  exactHash: string;
  wordCount: number;
  charCount: number;
  publishedTime: string | null;
  modifiedTime: string | null;
  favicon: string | null;
  captureReason: 'initial' | 'mutation';
  userId: string;
  extensionVersion: string;
  requestId: string;
}

export interface SearchBody {
  query: string;
  k: number;
  from?: string;
  to?: string;
}

export const EPOCH_ZERO = '1970-01-01T00:00:00.000Z';

export interface SearchResponse {
  results: SearchResult[];
  corrections?: Record<string, string>;
}

export interface SearchResult {
  id: number;
  url: string;
  title: string | null;
  snippet: string | null;
  favicon: string | null;
  domain: string | null;
  siteName: string | null;
  author: string | null;
  excerpt: string | null;
  capturedAt: string | null;
  publishedTime: string | null;
  wordCount: number | null;
  lang: string | null;
  captureReason: string | null;
}

export interface PageRow {
  id: number;
  url: string;
  domain: string | null;
  lang: string | null;
  title: string | null;
  content: string | null;
  content_markdown: string | null;
  excerpt: string | null;
  author: string | null;
  site_name: string | null;
  stable_hash: string;
  exact_hash: string;
  word_count: number | null;
  char_count: number | null;
  published_time: string | null;
  modified_time: string | null;
  favicon: string | null;
  capture_reason: string | null;
  user_id: string;
  extension_version: string | null;
  request_id: string | null;
  captured_at: string;
}
