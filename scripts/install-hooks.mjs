#!/usr/bin/env node
/**
 * @created 2026-09-05
 * @description 将独立采集 hook 安装到全局或项目配置目录并保留已有配置。
 * @author yunhungo
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (
  !['--global', '--project'].includes(args[0]) ||
  args.length > 2 ||
  (args[0] === '--global' && args[1])
) {
  console.error('Usage: node scripts/install-hooks.mjs --global | --project [project-path]');
  process.exit(1);
}
if (process.platform === 'win32')
  throw new Error('This installer supports macOS and Linux; use the packaged plugin on Windows.');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configDir =
  args[0] === '--global'
    ? resolve(process.env.CODEX_HOME || join(homedir(), '.codex'))
    : join(resolve(args[1] || process.cwd()), '.codex');
const hookFile = join(configDir, 'hooks.json');
const previous = existsSync(hookFile) ? readFileSync(hookFile, 'utf8') : undefined;
const data = previous === undefined ? {} : JSON.parse(previous);
if (!data || typeof data !== 'object' || Array.isArray(data))
  throw new Error('hooks.json must be an object');
if (
  data.hooks !== undefined &&
  (!data.hooks || typeof data.hooks !== 'object' || Array.isArray(data.hooks))
)
  throw new Error('Invalid hooks map');
data.hooks ??= {};
if (data.hooks.Stop !== undefined && !Array.isArray(data.hooks.Stop))
  throw new Error('Invalid Stop hook list');
data.hooks.Stop ??= [];
const target = join(configDir, 'hooks', 'x-langfuse', 'index.mjs');
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const command = `${quote(process.execPath)} ${quote(target)}`;
// Preserve every unrelated handler; an identical install is idempotent.
if (!data.hooks.Stop.some((group) => group?.hooks?.some((hook) => hook.command === command))) {
  data.hooks.Stop.push({
    hooks: [
      { type: 'command', command, timeout: 30, statusMessage: 'Uploading Codex trace to Langfuse' },
    ],
  });
}
mkdirSync(dirname(target), { recursive: true });
copyFileSync(join(repo, 'plugins/tracing/dist/index.mjs'), target);
for (const file of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.txt']) {
  copyFileSync(join(repo, 'plugins/tracing', file), join(dirname(target), file));
}
if (previous !== undefined)
  writeFileSync(`${hookFile}.backup-${Date.now()}`, previous, { mode: 0o600 });
writeFileSync(hookFile, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
const yaml = join(configDir, 'langfuse.yaml');
const hasConfig = ['langfuse.yaml', 'langfuse.yml', 'langfuse.json'].some((name) =>
  existsSync(join(configDir, name)),
);
if (!hasConfig) copyFileSync(join(repo, 'examples/langfuse.yaml'), yaml);
const toml = join(configDir, 'config.toml');
if (!existsSync(toml))
  writeFileSync(toml, '[features]\nhooks = true\n', { flag: 'wx', mode: 0o600 });
console.log(`Installed Stop hook: ${hookFile}`);
console.log(`Configuration directory: ${configDir}`);
console.log(
  'Restart Codex and review the hook in /hooks. Configure Langfuse keys in YAML to enable export.',
);
