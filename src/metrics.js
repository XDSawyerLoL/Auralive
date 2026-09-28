const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export class RuntimeMetrics {
  constructor(limit = 500) {
    this.limit = Math.max(50, Number(limit) || 500);
    this.startedAt = Date.now();
    this.totalRequests = 0;
    this.errorResponses = 0;
    this.latencies = [];
    this.routes = new Map();
  }

  begin(request) {
    request.auraStartedAt = Date.now();
  }

  observe(request, reply) {
    const duration = Math.max(0, Date.now() - Number(request.auraStartedAt || Date.now()));
    const route = request.routeOptions?.url || request.url || 'unknown';
    const status = Number(reply.statusCode || 0);
    this.totalRequests += 1;
    if (status >= 500) this.errorResponses += 1;
    this.latencies.push(duration);
    if (this.latencies.length > this.limit) this.latencies.shift();

    const current = this.routes.get(route) || {
      requests: 0,
      errors: 0,
      total_ms: 0,
      max_ms: 0,
    };
    current.requests += 1;
    if (status >= 500) current.errors += 1;
    current.total_ms += duration;
    current.max_ms = Math.max(current.max_ms, duration);
    this.routes.set(route, current);
  }

  snapshot({ runtimeReady = false, dbReady = false, ai = null, evolution = null } = {}) {
    const requestCount = this.totalRequests;
    const errorRate = requestCount ? this.errorResponses / requestCount : 0;
    const p95 = percentile(this.latencies, 95);
    const p50 = percentile(this.latencies, 50);
    const alerts = [];

    if (!runtimeReady) alerts.push({ level: 'critical', code: 'runtime_not_ready' });
    if (!dbReady) alerts.push({ level: 'critical', code: 'database_not_ready' });
    if (requestCount >= 20 && errorRate >= 0.10) {
      alerts.push({ level: 'warning', code: 'high_server_error_rate', value: Number(errorRate.toFixed(4)) });
    }
    if (this.latencies.length >= 20 && p95 >= 2500) {
      alerts.push({ level: 'warning', code: 'high_p95_latency_ms', value: p95 });
    }
    if (ai?.last_error) {
      alerts.push({ level: 'warning', code: 'ai_last_error', value: String(ai.last_error).slice(0, 300) });
    }
    if (evolution?.last_error) {
      alerts.push({ level: 'warning', code: 'evolution_last_error', value: String(evolution.last_error).slice(0, 300) });
    }

    const routeStats = [...this.routes.entries()]
      .map(([route, value]) => ({
        route,
        requests: value.requests,
        errors: value.errors,
        average_ms: value.requests ? Math.round(value.total_ms / value.requests) : 0,
        max_ms: value.max_ms,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 25);

    return {
      version: 'aura-runtime-metrics-v1',
      uptime_seconds: Math.floor((Date.now() - this.startedAt) / 1000),
      requests: requestCount,
      server_errors: this.errorResponses,
      error_rate: Number(errorRate.toFixed(4)),
      latency_ms: {
        p50,
        p95,
        max: this.latencies.length ? Math.max(...this.latencies) : 0,
        samples: this.latencies.length,
      },
      routes: routeStats,
      alerts,
      health_score: clamp(
        100
          - (runtimeReady ? 0 : 40)
          - (dbReady ? 0 : 30)
          - Math.round(errorRate * 100)
          - (p95 >= 2500 ? 10 : 0),
        0,
        100,
      ),
      generated_at: new Date().toISOString(),
    };
  }
}
