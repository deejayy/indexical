export type Token =
  | { kind: 'term'; value: string; negated: boolean }
  | { kind: 'phrase'; value: string; negated: boolean }
  | { kind: 'filter'; name: 'site' | 'inurl' | 'intitle' | 'lang'; value: string; negated: boolean };

interface Cursor {
  s: string;
  i: number;
}

function skipSpaces(c: Cursor): void {
  while (c.i < c.s.length && c.s[c.i] === ' ') c.i++;
}

function readPhrase(c: Cursor, negated: boolean): Token | null {
  c.i++;
  const start = c.i;
  while (c.i < c.s.length && c.s[c.i] !== '"') c.i++;
  const value = c.s.slice(start, c.i);
  if (c.s[c.i] === '"') c.i++;
  return value ? { kind: 'phrase', value, negated } : null;
}

const FILTER_RE = /^(site|inurl|intitle|lang):(.+)$/;
const UNKNOWN_PREFIX_RE = /^[a-zA-Z]+:(.+)$/;

function readWord(c: Cursor, negated: boolean): Token {
  const start = c.i;
  while (c.i < c.s.length && c.s[c.i] !== ' ') c.i++;
  const word = c.s.slice(start, c.i);
  const m = word.match(FILTER_RE);
  if (m) {
    return { kind: 'filter', name: m[1] as 'site' | 'inurl' | 'intitle' | 'lang', value: m[2] ?? '', negated };
  }
  const unknown = word.match(UNKNOWN_PREFIX_RE);
  if (unknown) {
    return { kind: 'term', value: unknown[1] ?? '', negated };
  }
  return { kind: 'term', value: word, negated };
}

const MAX_TOKENS = 32;

export function parseQuery(raw: string): Token[] {
  const tokens: Token[] = [];
  const c: Cursor = { s: raw.trim(), i: 0 };

  while (c.i < c.s.length && tokens.length < MAX_TOKENS) {
    skipSpaces(c);
    if (c.i >= c.s.length) break;

    const negated = c.s[c.i] === '-';
    if (negated) c.i++;

    if (c.s[c.i] === '"') {
      const tok = readPhrase(c, negated);
      if (tok) tokens.push(tok);
    } else {
      const tok = readWord(c, negated);
      if (tok.kind !== 'term' || tok.value) tokens.push(tok);
    }
  }

  return tokens;
}

const FTS_SPECIAL = /[*^{}[\]:()]/g;
const FTS_KEYWORDS = new Set(['and', 'or', 'not', 'near']);

function sanitizeFtsTerm(term: string): string {
  const cleaned = term.replace(FTS_SPECIAL, '').trim();
  if (FTS_KEYWORDS.has(cleaned.toLowerCase())) return '';
  return cleaned;
}

interface SqlParts {
  ftsQuery: string;
  whereClauses: string[];
  params: (string | number)[];
}

function buildTermFts(tok: Token & { kind: 'term' }): string | null {
  const safe = sanitizeFtsTerm(tok.value);
  if (!safe) return null;
  return tok.negated ? `NOT ${safe}` : safe;
}

function buildPhraseFts(tok: Token & { kind: 'phrase' }): string {
  const escaped = tok.value.replace(/"/g, '""');
  return tok.negated ? `NOT "${escaped}"` : `"${escaped}"`;
}

function escapeLike(v: string): string {
  return v.replace(/[%_\\]/g, '\\$&');
}

function buildFilterSql(
  tok: Token & { kind: 'filter' },
  ftsParts: string[],
  whereClauses: string[],
  params: (string | number)[],
): void {
  if (tok.name === 'site' || tok.name === 'inurl') {
    const col = tok.name === 'site' ? 'p.domain' : 'p.url';
    whereClauses.push(tok.negated ? `${col} NOT LIKE ? ESCAPE '\\'` : `${col} LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(tok.value)}%`);
    return;
  }
  if (tok.name === 'lang') {
    whereClauses.push(tok.negated ? 'p.lang != ?' : 'p.lang = ?');
    params.push(tok.value);
    return;
  }
  const escaped = tok.value.replace(/"/g, '""');
  ftsParts.push(tok.negated ? `NOT title:"${escaped}"` : `title:"${escaped}"`);
}

export function buildSql(tokens: Token[]): SqlParts {
  const ftsParts: string[] = [];
  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  for (const tok of tokens) {
    if (tok.kind === 'term') {
      const fts = buildTermFts(tok);
      if (fts) ftsParts.push(fts);
    } else if (tok.kind === 'phrase') {
      ftsParts.push(buildPhraseFts(tok));
    } else {
      buildFilterSql(tok, ftsParts, whereClauses, params);
    }
  }

  return { ftsQuery: ftsParts.join(' '), whereClauses, params };
}
