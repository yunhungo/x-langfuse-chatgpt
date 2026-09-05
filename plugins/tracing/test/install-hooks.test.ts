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

it('ships a self-contained npm package with a working bin and configuration template', () => {
  const root = mkdtempSync(join(tmpdir(), 'hooks-package-'));
  try {
    execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', root], {
      cwd: resolve('.'),
      env: { ...process.env, npm_config_cache: join(root, 'npm-cache') },
      stdio: 'pipe',
    });
    const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
    execFileSync('tar', [
      '-xzf',
      join(root, `${manifest.name}-${manifest.version}.tgz`),
      '-C',
      root,
    ]);
    const unpacked = join(root, 'package');
    const packagedManifest = JSON.parse(readFileSync(join(unpacked, 'package.json'), 'utf8'));
    const installer = join(unpacked, packagedManifest.bin['x-langfuse-chatgpt']);
    const configDir = join(root, 'config');
    execFileSync(process.execPath, [installer, '--global'], {
      cwd: root,
      env: { ...process.env, CODEX_HOME: configDir },
      stdio: 'pipe',
    });
    expect(readFileSync(join(configDir, 'langfuse.yaml'), 'utf8')).toContain('enabled: false');
    expect(existsSync(join(configDir, 'hooks/x-langfuse/THIRD_PARTY_NOTICES.txt'))).toBe(true);
    expect(existsSync(join(unpacked, 'node_modules'))).toBe(false);
    const help = execFileSync(process.execPath, [installer, '--help'], { encoding: 'utf8' });
    expect(help).toContain('--project');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
