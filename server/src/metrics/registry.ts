import { Registry, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'wmd_node_' });

export const gauges = {
  up: new Gauge({
    name: 'wmd_up',
    help: 'Service up (1 = healthy)',
    registers: [registry],
  }),
};
