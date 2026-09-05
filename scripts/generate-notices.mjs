#!/usr/bin/env node
/**
 * @created 2026-09-05
 * @description 汇总运行依赖的许可证以随独立插件分发。
 * @author yunhungo
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seen = new Map();
function visit(name, from) {
  const require = createRequire(from);
  let entry;
  try {
    entry = require.resolve(`${name}/package.json`);
  } catch {
    entry = require.resolve(name);
  }
  let directory = dirname(entry);
  let manifest;
  while (true) {
    try {
      const candidate = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      if (candidate.name === name) {
        manifest = candidate;
        break;
      }
    } catch {
      /* package subdirectory */
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate license for ${name}`);
    directory = parent;
  }
  const id = `${name}@${manifest.version}`;
  if (seen.has(id)) return;
  const licenseFiles = readdirSync(directory).filter((file) =>
    /^(license|licence|notice)(\.|$)/i.test(file),
  );
  if (!licenseFiles.length) throw new Error(`Missing license for ${id}`);
  seen.set(id, licenseFiles.map((file) => readFileSync(join(directory, file), 'utf8')).join('\n'));
  for (const dependency of Object.keys(manifest.dependencies || {}))
    visit(dependency, join(directory, 'package.json'));
}
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const name of Object.keys(manifest.dependencies)) visit(name, join(root, 'package.json'));
const output = [...seen]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, license]) => `${name}\n${'='.repeat(name.length)}\n\n${license}`)
  .join('\n\n');
writeFileSync(join(root, 'plugins/tracing/THIRD_PARTY_NOTICES.txt'), output);
console.log(`Included licenses for ${seen.size} runtime packages`);
