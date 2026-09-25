import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeMetrics } from '../src/metrics.js';

test('runtime metrics surfaces latency and server-error alerts', () => {
  const metrics = new RuntimeMetrics(100);
  for (let i = 0; i < 25; i += 1) {
    const request = { routeOptions: { url: '/api/chat' }, url: '/api/chat' };
    metrics.begin(request);
    request.auraStartedAt -= i === 0 ? 3000 : 20;
    metrics.observe(request, { statusCode: i < 3 ? 500 : 200 });
  }
  const snapshot = metrics.snapshot({ runtimeReady: true, dbReady: true });
  assert.equal(snapshot.requests, 25);
  assert.equal(snapshot.server_errors, 3);
  assert.ok(snapshot.alerts.some((item) => item.code === 'high_server_error_rate'));
  assert.ok(snapshot.health_score < 100);
});

test('runtime metrics reports critical runtime readiness', () => {
  const snapshot = new RuntimeMetrics().snapshot({ runtimeReady: false, dbReady: false });
  assert.ok(snapshot.alerts.some((item) => item.code === 'runtime_not_ready'));
  assert.ok(snapshot.alerts.some((item) => item.code === 'database_not_ready'));
});
