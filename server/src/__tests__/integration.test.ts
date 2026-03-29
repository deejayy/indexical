import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../app.js';
import type { AppDeps } from '../app.js';
import { config } from '../config.js';
import { setupTestDb, makeBody } from './helpers/testDb.js';

function makeDeps(db: Database.Database): AppDeps {
  return { db, config, spellfixAvailable: false };
}

describe('integration: app routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = setupTestDb();
    app = createApp(makeDeps(db));
  });

  afterEach(() => {
    db.close();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('ts');
    });

    it('includes X-API-Version header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-api-version']).toBeDefined();
    });
  });

  describe('POST /ingest', () => {
    it('returns 401 without X-API-Key', async () => {
      const res = await request(app)
        .post('/ingest')
        .send(makeBody());
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('returns 400 for invalid body', async () => {
      const res = await request(app)
        .post('/ingest')
        .set('X-API-Key', 'testuser')
        .send({ invalid: true });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'BAD_REQUEST');
    });

    it('returns 403 when userId does not match api key', async () => {
      const res = await request(app)
        .post('/ingest')
        .set('X-API-Key', 'wronguser')
        .send(makeBody());
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    });

    it('ingests a valid page', async () => {
      const body = makeBody({ userId: 'testuser' });
      const res = await request(app)
        .post('/ingest')
        .set('X-API-Key', 'testuser')
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, skipped: false });
    });

    it('returns skipped for duplicate', async () => {
      const body = makeBody({ userId: 'testuser' });
      await request(app)
        .post('/ingest')
        .set('X-API-Key', 'testuser')
        .send(body);
      const res = await request(app)
        .post('/ingest')
        .set('X-API-Key', 'testuser')
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, skipped: true });
    });
  });

  describe('POST /search', () => {
    beforeEach(async () => {
      const body = makeBody({ userId: 'testuser' });
      await request(app)
        .post('/ingest')
        .set('X-API-Key', 'testuser')
        .send(body);
    });

    it('returns 401 without X-API-Key', async () => {
      const res = await request(app)
        .post('/search')
        .send({ query: 'test', k: 10 });
      expect(res.status).toBe(401);
    });

    it('returns 400 for missing query', async () => {
      const res = await request(app)
        .post('/search')
        .set('X-API-Key', 'testuser')
        .send({ k: 10 });
      expect(res.status).toBe(400);
    });

    it('returns results for matching query', async () => {
      const res = await request(app)
        .post('/search')
        .set('X-API-Key', 'testuser')
        .send({ query: 'test', k: 10 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('results');
      expect(res.body.results.length).toBeGreaterThan(0);
    });

    it('returns empty for non-matching query', async () => {
      const res = await request(app)
        .post('/search')
        .set('X-API-Key', 'testuser')
        .send({ query: 'nonexistentxyz', k: 10 });
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
    });
  });

  describe('GET /pages/:id/markdown', () => {
    beforeEach(async () => {
      const body = makeBody({ userId: 'testuser' });
      await request(app)
        .post('/ingest')
        .set('X-API-Key', 'testuser')
        .send(body);
    });

    it('returns 401 without X-API-Key', async () => {
      const res = await request(app).get('/pages/1/markdown');
      expect(res.status).toBe(401);
    });

    it('returns 400 for non-numeric id', async () => {
      const res = await request(app)
        .get('/pages/abc/markdown')
        .set('X-API-Key', 'testuser');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent page', async () => {
      const res = await request(app)
        .get('/pages/999/markdown')
        .set('X-API-Key', 'testuser');
      expect(res.status).toBe(404);
    });

    it('returns markdown for valid page', async () => {
      const res = await request(app)
        .get('/pages/1/markdown')
        .set('X-API-Key', 'testuser');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('contentMarkdown', '# Test');
    });
  });

  describe('unknown routes', () => {
    it('returns 404 for unknown path', async () => {
      const res = await request(app).get('/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /stats', () => {
    it('returns 401 without X-API-Key', async () => {
      const res = await request(app).get('/stats');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('returns stats with expected fields', async () => {
      const res = await request(app)
        .get('/stats')
        .set('X-API-Key', 'testuser');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalPages');
      expect(res.body).toHaveProperty('distinctDomains');
      expect(res.body).toHaveProperty('ts');
    });
  });
});
