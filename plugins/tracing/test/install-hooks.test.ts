/**
 * @created 2026-09-05
 * @description 验证全局和项目 hooks 安装时保留用户配置并避免重复注册。
 * @author yunhungo
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';

it.each(['--global', '--project'])('installs %s without overwriting configuration', (scope) => {
  const root = mkdtempSync(join(tmpdir(), 'hooks install-'));
  const config = scope === '--global' ? root : join(root, '.codex');
  mkdirSync(config, { recursive: true });
  const original = {
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing' }] }] },
  };
  writeFileSync(join(config, 'hooks.json'), JSON.stringify(original));
  writeFileSync(join(config, 'langfuse.json'), '{"enabled": true}');
  const args = [
    resolve('scripts/install-hooks.mjs'),
    scope,
    ...(scope === '--project' ? [root] : []),
  ];
  try {
    for (let index = 0; index < 2; index++)
      execFileSync(process.execPath, args, {
        env: { ...process.env, CODEX_HOME: root },
        stdio: 'pipe',
      });
    const result = JSON.parse(readFileSync(join(config, 'hooks.json'), 'utf8'));
    expect(result.hooks.Stop).toHaveLength(2);
    expect(result.hooks.Stop[0]).toEqual(original.hooks.Stop[0]);
    expect(readFileSync(join(config, 'langfuse.json'), 'utf8')).toBe('{"enabled": true}');
    expect(existsSync(join(config, 'langfuse.yaml'))).toBe(false);
    expect(existsSync(join(config, 'hooks/x-langfuse/index.mjs'))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
