import type { Database } from 'better-sqlite3';
import type { Logger } from 'pino';
import type { Counter } from 'prom-client';
import type { IngestBody } from '../types.js';
import { PAGES_INSERT_SQL, bodyToRow } from '../db/schema.js';

export interface SpellfixConfig {
  minWordLen: number;
  maxWordLen: number;
}

export interface IngestMetrics {
  spellfixErrors: Counter;
}

const WORD_RE = /[\p{L}\p{M}'-]+/gu;

export function extractSpellfixWords(text: string, cfg: SpellfixConfig): string[] {
  const candidates: string[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const w = m[0].toLowerCase();
    if (w.length >= cfg.minWordLen && w.length <= cfg.maxWordLen) {
      candidates.push(w);
    }
  }
  return [...new Set(candidates)];
}

export type IngestResult = 'inserted' | 'duplicate';

export function ingestPage(
  db: Database, body: IngestBody, spellfixAvailable: boolean, spellfixCfg: SpellfixConfig,
  log: Logger, metrics: IngestMetrics,
): IngestResult {
  const row = bodyToRow(body);

  const doIngest = db.transaction(() => {
    const existing = db
      .prepare('SELECT 1 FROM pages WHERE url = ? AND stable_hash = ? AND user_id = ? LIMIT 1')
      .get(body.url, body.stableHash, body.userId);
    if (existing !== undefined) return 'duplicate' as const;

    db.prepare(PAGES_INSERT_SQL).run(row);

    if (spellfixAvailable) {
      try {
        const text = [body.title, body.content, body.excerpt, body.author]
          .filter(Boolean)
          .join(' ');
        const words = extractSpellfixWords(text, spellfixCfg);
        if (words.length > 0) {
          const insWord = db.prepare('INSERT OR IGNORE INTO spellfix_words(word) VALUES (?)');
          const insVocab = db.prepare('INSERT INTO spellfix_vocab(word) VALUES (?)');
          for (const w of words) {
            const changes = (insWord.run(w) as { changes: number }).changes;
            if (changes > 0) insVocab.run(w);
          }
        }
      } catch (err) {
        metrics.spellfixErrors.inc();
        log.warn({ err, msg: 'spellfix indexing failed, page inserted without spellfix' });
      }
    }

    return 'inserted' as const;
  });

  return doIngest();
}
