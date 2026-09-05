/**
 * @created 2026-09-05
 * @description 读取并校验 YAML 配置及环境变量引用。
 * @author yunhungo
 */
import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';

export async function readYamlConfig(
  file: string,
  env: Record<string, string | undefined>,
): Promise<unknown | undefined> {
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error('Cannot read Langfuse YAML configuration');
  }
  try {
    const document = parseDocument(source, { uniqueKeys: true });
    if (document.errors.length) throw new Error('Invalid YAML');
    const raw: unknown = document.toJS({ maxAliasCount: 50 });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected mapping');
    const expand = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
          if (env[name] === undefined) throw new Error('Missing environment variable');
          return env[name];
        });
      }
      if (Array.isArray(value)) return value.map(expand);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)]));
      }
      return value;
    };
    return expand(raw);
  } catch {
    // Never include parser diagnostics: they can quote API keys from the document.
    throw new Error('Invalid Langfuse YAML configuration; check syntax and environment references');
  }
}
