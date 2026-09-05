/**
 * @created 2026-09-05
 * @description 验证 YAML 配置优先级、兼容性及敏感配置错误边界。
 * @author yunhungo
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { getConfig } from '../src/config.js';
import { createRedactor } from '../src/privacy.js';

const roots: string[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'yaml-config-'));
  roots.push(root);
  const global = join(root, 'custom-home');
  const cwd = join(root, 'project');
  mkdirSync(global);
  mkdirSync(join(cwd, '.codex'), { recursive: true });
  return { root, global, cwd };
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

it('layers CODEX_HOME JSON, YML, YAML, project and scoped environment', async () => {
  const { root, global, cwd } = setup();
  writeFileSync(
    join(global, 'langfuse.json'),
    JSON.stringify({ enabled: true, public_key: 'legacy' }),
  );
  writeFileSync(join(global, 'langfuse.yml'), 'public_key: short-extension\n');
  writeFileSync(join(global, 'langfuse.yaml'), 'public_key: yaml\nsecret_key: "${TEST_SECRET}"\n');
  writeFileSync(
    join(cwd, '.codex/langfuse.yaml'),
    'public_key: project\nmetadata:\n  team: tools\n',
  );
  const options = { home: root, cwd, env: { CODEX_HOME: global, TEST_SECRET: 'secret' } };
  const config = await getConfig(options);
  expect(config.enabled).toBe(true);
  expect(config.secret_key).toBe('secret');
  expect(config.public_key).toBe('project');
  expect(config.metadata).toEqual({ team: 'tools' });
  expect(
    (
      await getConfig({
        ...options,
        env: {
          ...options.env,
          LANGFUSE_CODEX_PUBLIC_KEY: 'scoped',
          LANGFUSE_PUBLIC_KEY: 'standard',
        },
      })
    ).public_key,
  ).toBe('scoped');
});

it.each([
  'enabled: true\nenabled: false',
  'enabled: "true"',
  'secret_key: "${UNSET_SECRET}"',
  'typo_key: secret-value',
  'redact_patterns: ["["]',
  'base_url: file:///tmp/traces',
  '- not-a-mapping',
])('rejects invalid YAML without quoting configuration: %s', async (source) => {
  const { root, global, cwd } = setup();
  writeFileSync(join(global, 'langfuse.yaml'), source);
  await expect(getConfig({ home: root, cwd, env: { CODEX_HOME: global } })).rejects.toThrow(
    /Invalid Langfuse YAML/,
  );
});

it('redacts configured keys, common key prefixes and custom patterns', async () => {
  const { root, global, cwd } = setup();
  writeFileSync(
    join(global, 'langfuse.yaml'),
    'secret_key: unusual-secret\nredact_patterns: ["client-[0-9]+"]\n',
  );
  const config = await getConfig({ home: root, cwd, env: { CODEX_HOME: global } });
  expect(createRedactor(config)('unusual-secret sk-lf-abc client-123')).toBe(
    '[REDACTED] [REDACTED] [REDACTED]',
  );
});
