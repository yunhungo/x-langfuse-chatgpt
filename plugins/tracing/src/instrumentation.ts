/**
 * @created 2026-09-05
 * @description 配置 Langfuse 导出器并在确认网络导出后更新完成状态。
 * @author yunhungo
 * Derived from Langfuse's MIT-licensed instrumentation.ts; see NOTICE.
 */
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { ExportResultCode } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { Config } from './config.js';
import { createRedactor } from './privacy.js';

export type Instrumentation = {
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
};

export function setupInstrumentation(config: Config): Instrumentation {
  const redact = createRedactor(config);
  const transport = new OTLPTraceExporter({
    url: `${config.base_url.replace(/\/$/, '')}/api/public/otel/v1/traces`,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.public_key}:${config.secret_key}`).toString('base64')}`,
    },
    timeoutMillis: 5000,
  });
  let failed = false;
  const exporter: SpanExporter = {
    export(spans, callback) {
      const safeSpans = spans.map((span) => ({
        ...span,
        spanContext: () => span.spanContext(),
        name: redact(span.name),
        status: { ...span.status, message: span.status.message && redact(span.status.message) },
        attributes: Object.fromEntries(
          Object.entries(span.attributes).map(([key, value]) => [
            key,
            typeof value === 'string'
              ? redact(value)
              : Array.isArray(value) && value.every((item) => typeof item === 'string')
                ? value.map(redact)
                : value,
          ]),
        ),
      }));
      transport.export(safeSpans, (result) => {
        if (result.code !== ExportResultCode.SUCCESS) failed = true;
        callback(result);
      });
    },
    shutdown: () => transport.shutdown(),
  };
  const processor = new LangfuseSpanProcessor({
    publicKey: config.public_key,
    secretKey: config.secret_key,
    baseUrl: config.base_url,
    environment: config.environment,
    exporter,
    // Immediate processing avoids silently dropping spans when a long turn
    // exceeds the bounded batch queue. forceFlush waits for all exports.
    exportMode: 'immediate',
    shouldExportSpan: () => true,
  });
  const provider = new NodeTracerProvider({ spanProcessors: [processor] });
  provider.register();
  const flush = async (): Promise<void> => {
    await processor.forceFlush();
    if (failed)
      throw new Error('Langfuse export failed; completed turns remain eligible for retry');
  };
  return {
    flush,
    shutdown: async () => {
      try {
        await flush();
      } finally {
        await provider.shutdown();
      }
    },
  };
}
