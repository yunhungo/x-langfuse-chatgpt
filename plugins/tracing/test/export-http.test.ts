/**
 * @created 2026-09-05
 * @description 验证独立 hook 的 HTTP 导出、脱敏、去重和失败重试。
 * @author yunhungo
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';

it('exports through the bundled hook, retries failures, redacts and deduplicates', async () => {
  const root = mkdtempSync(join(tmpdir(), 'langfuse-http-'));
  const cwd = join(root, 'project');
  mkdirSync(join(cwd, '.codex'), { recursive: true });
  let status = 401;
  const bodies: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      expect(request.url).toBe('/api/public/otel/v1/traces');
      const body = Buffer.concat(chunks);
      bodies.push(
        (request.headers['content-encoding'] === 'gzip' ? gunzipSync(body) : body).toString(),
      );
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end('{}');
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  const transcript = join(root, 'rollout.jsonl');
  const fixture = readFileSync(
    resolve('plugins/tracing/test/fixtures/sessions/2026/06/03/rollout-basic-main.jsonl'),
    'utf8',
  );
  writeFileSync(
    transcript,
    fixture.replaceAll('List the files', 'sk-lf-test-secret client-123 List the files'),
  );
  writeFileSync(
    join(cwd, '.codex/langfuse.yaml'),
    `enabled: true\npublic_key: pk-lf-test\nsecret_key: sk-lf-test-secret\nbase_url: http://127.0.0.1:${address.port}\nfail_on_error: true\nredact_patterns: ['client-[0-9]+']\n`,
  );
  const run = () =>
    new Promise<number | null>((done, reject) => {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !/^(LANGFUSE_|OTEL_|TRACE_TO_LANGFUSE|NODE_OPTIONS)/.test(key),
        ),
      );
      const child = spawn(process.execPath, [resolve('plugins/tracing/dist/index.mjs')], {
        cwd: root,
        env: { ...env, CODEX_HOME: root, HOME: root },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Hook timed out'));
      }, 15000);
      child.stdout.resume();
      child.stderr.resume();
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        done(code);
      });
      child.stdin.end(
        JSON.stringify({ hook_event_name: 'Stop', cwd, transcript_path: transcript }),
      );
    });
  try {
    expect(await run()).toBe(1);
    expect(bodies.length).toBeGreaterThan(0);
    expect(existsSync(`${transcript}.langfuse`)).toBe(false);
    status = 200;
    bodies.length = 0;
    expect(await run()).toBe(0);
    expect(readFileSync(`${transcript}.langfuse`, 'utf8')).toContain('turn-1');
    const payload = bodies.join('\n');
    expect(payload).toContain('Codex Turn');
    expect(payload).toContain('generation');
    expect(payload).toContain('exec_command');
    expect(payload).toContain('gpt-5.4');
    expect(payload).toContain('sess-basic');
    expect(payload).toContain('[REDACTED]');
    expect(payload).not.toContain('sk-lf-test-secret');
    expect(payload).not.toContain('client-123');
    const count = bodies.length;
    expect(await run()).toBe(0);
    expect(bodies.length).toBe(count);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(root, { recursive: true, force: true });
  }
}, 45000);
