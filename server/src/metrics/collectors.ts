import { Counter, Histogram } from 'prom-client';
import { registry } from './registry.js';

export const counters = {
  ingestTotal: new Counter({
    name: 'wmd_ingest_total',
    help: 'Total successful ingest requests',
    registers: [registry],
  }),
  ingestErrors: new Counter({
    name: 'wmd_ingest_errors_total',
    help: 'Ingest errors by reason',
    labelNames: ['reason'],
    registers: [registry],
  }),
  searchTotal: new Counter({
    name: 'wmd_search_total',
    help: 'Total successful search requests',
    registers: [registry],
  }),
  searchErrors: new Counter({
    name: 'wmd_search_errors_total',
    help: 'Search errors by reason',
    labelNames: ['reason'],
    registers: [registry],
  }),
  httpRequests: new Counter({
    name: 'wmd_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  }),
  spellfixErrors: new Counter({
    name: 'wmd_spellfix_errors_total',
    help: 'Spellfix operation failures',
    registers: [registry],
  }),
};

export const histograms = {
  ingestLatency: new Histogram({
    name: 'wmd_ingest_duration_ms',
    help: 'Ingest handler latency in ms',
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
    registers: [registry],
  }),
  searchLatency: new Histogram({
    name: 'wmd_search_duration_ms',
    help: 'Search handler latency in ms',
    buckets: [1, 5, 10, 25, 50, 100, 250, 500],
    registers: [registry],
  }),
  httpLatency: new Histogram({
    name: 'wmd_http_duration_ms',
    help: 'HTTP request latency in ms',
    labelNames: ['method', 'route'],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
    registers: [registry],
  }),
};
