/**
 * @created 2026-09-05
 * @description 在导出前屏蔽凭据和用户指定的敏感文本。
 * @author yunhungo
 */
import type { Config } from './config.js';

export function createRedactor(config: Config): (data: string) => string {
  const secrets = [config.public_key, config.secret_key].filter((key): key is string => !!key);
  const patterns = (config.redact_patterns ?? []).map((pattern) => new RegExp(pattern, 'g'));
  return (data) => {
    let result = data;
    for (const secret of secrets) result = result.split(secret).join('[REDACTED]');
    result = result.replace(/\b(?:sk-lf-|pk-lf-|sk-proj-|ghp_|gho_)[A-Za-z0-9_-]+/g, '[REDACTED]');
    for (const pattern of patterns) result = result.replace(pattern, '[REDACTED]');
    return result;
  };
}
