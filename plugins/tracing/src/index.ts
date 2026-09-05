/**
 * @created unknown
 * @description 接收 Codex hook 并协调采集与导出。
 * @author yunhungo
 * Derived from Langfuse (MIT); local modifications 2026-09-05. See NOTICE.
 */
import { z } from "zod";
import { getConfig } from "./config.js";
import { setupInstrumentation } from "./instrumentation.js";
import { convertRollout } from "./trace.js";
import type { HookInput } from "./types.js";
import { debugLog, readStdin, setDebug } from "./utils.js";

let failOnError = process.env.LANGFUSE_CODEX_FAIL_ON_ERROR === "true";

/**
 * Entry point for the Codex `Stop` hook.
 *
 * Codex pipes a JSON payload to stdin after every turn. We resolve config,
 * bail out unless tracing is explicitly enabled, then convert the rollout
 * transcript into Langfuse traces.
 *
 * The hook fails open: any error is logged (in debug mode) and swallowed so a
 * tracing problem never blocks the Codex session. Set
 * `LANGFUSE_CODEX_FAIL_ON_ERROR=true` while testing if you want Codex to report
 * hook failures instead.
 */
export async function runHook(): Promise<void> {
  let hookInput: HookInput;
  try {
    hookInput = z
      .object({ transcript_path: z.string(), cwd: z.string().optional() })
      .parse(await readStdin<unknown>());
  } catch (error) {
    // No usable payload — nothing we can do.
    return;
  }

  const config = await getConfig({ cwd: hookInput.cwd }).catch(() => {
    throw new Error("Invalid Langfuse configuration");
  });
  setDebug(config.debug);
  failOnError = config.fail_on_error;

  if (!config.enabled) {
    debugLog("tracing disabled (set TRACE_TO_LANGFUSE=true to enable)");
    return;
  }
  if (!config.public_key || !config.secret_key) {
    debugLog("missing LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY; skipping");
    return;
  }
  if (!hookInput.transcript_path) {
    debugLog("hook payload missing transcript_path; skipping");
    return;
  }

  const instrumentation = setupInstrumentation(config);
  try {
    await convertRollout(hookInput.transcript_path, { config, flush: instrumentation.flush });
  } catch (error) {
    debugLog("failed to convert rollout:", error);
    if (config.fail_on_error) throw error;
  } finally {
    try {
      await instrumentation.shutdown();
    } catch (error) {
      debugLog("error during flush/shutdown:", error);
      if (config.fail_on_error) throw error;
    }
  }
}

runHook().catch(() => {
  // Last-resort guard: fail open unless explicitly requested for testing.
  console.error("[langfuse-codex] tracing failed; check configuration and connectivity");
  if (failOnError) {
    process.exitCode = 1;
  }
});
