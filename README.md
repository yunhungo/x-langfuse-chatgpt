# x-langfuse-chatgpt

Observe Codex through **Stop hooks**, with **global or project YAML configuration**.
The hook reconstructs Codex's local transcript and exports a trace tree to Langfuse.
No OpenAI API key, model wrapper, shell-exported credentials, or running daemon is required.

An independent extension of the MIT-licensed
[Langfuse Codex observability plugin](https://github.com/langfuse/codex-observability-plugin).
Existing `langfuse.json` files and environment variables remain supported.
See [NOTICE](NOTICE) for the pinned upstream revision and attribution.

## What you can observe

| Information                                            | Representation in Langfuse                                    |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| Conversation/thread                                    | Session ID groups turns                                       |
| User prompt and final response                         | Agent observation input/output                                |
| Model responses and available reasoning summaries      | Generation observations                                       |
| Model name, provider, Codex version                    | Model field and metadata                                      |
| Input/output, cached-input and reasoning-output tokens | Generation usage details                                      |
| Shell, patch, MCP and other tool calls                 | Tool input/output, error level and status                     |
| Timing                                                 | Original transcript start/end timestamps                      |
| Child agents                                           | Nested agent observations when their rollouts are available   |
| Interrupted turns                                      | Warning status when interruption exists in the parsed rollout |
| Team, environment and user                             | Configurable tags, metadata, environment and user ID          |

Costs depend on Langfuse recognizing the model and pricing. The hook does not
invent prices, missing tokens or model-internal reasoning. It runs after a turn;
it is not live token streaming. Generation inputs are reconstructed from the
user input and preceding tool results, **not a complete copy of the model request
context**. Hidden system prompts, unavailable reasoning and media bytes are not
recovered. An interruption is exported when a subsequent Stop hook reads it;
this package does not register the short-timeout Interrupt hook.

## Requirements

- Node.js **22+**.
- A current Codex version with trusted command hooks; **0.146+ recommended**.
- macOS or Linux for the direct installer. The plugin bundle itself uses Node.js;
  Windows installation is not covered by this release's tests.
- A Langfuse project for production use, with its public key, secret key and URL.
  The automated test suite uses a local HTTP receiver and needs no credentials.

The runtime is committed as a self-contained `plugins/tracing/dist/index.mjs`.
Installing from a clone does not require `pnpm install` or a build.

## Quick start: direct hooks installation

```bash
git clone https://github.com/yunhungo/x-langfuse-chatgpt.git
cd x-langfuse-chatgpt

# Choose ONE registration scope:
node scripts/install-hooks.mjs --global
# OR:
node scripts/install-hooks.mjs --project /absolute/path/to/your-project
```

The installer:

1. Copies the bundled runtime into `<config-dir>/hooks/x-langfuse/index.mjs`.
2. Adds a Stop handler to `<config-dir>/hooks.json`, preserving other handlers.
3. Backs up an existing hooks file; repeat installation does not add the same handler twice.
4. Creates a disabled example YAML only if no YAML/YML/JSON Langfuse config exists.
5. Creates `config.toml` with hooks enabled only if that file does not exist.

`<config-dir>` is `$CODEX_HOME` (default `~/.codex`) globally, or `<project>/.codex`
for a project installation. Existing `config.toml` and credential files are preserved.
The direct hook command uses absolute Node/runtime paths; rerun the installer after
moving the installation or changing the Node installation path.

Edit `langfuse.yaml` in that directory:

```yaml
enabled: true
public_key: pk-lf-replace-me
secret_key: sk-lf-replace-me
base_url: https://cloud.langfuse.com
```

Credentials can live directly in YAML; environment variables are optional.
Protect the file with `chmod 600` and keep it out of version control.
Restart Codex, open `/hooks`, and review/trust the new Stop hook. Trust your project
if using project-local hooks. If hooks are disabled in an existing `config.toml`,
merge this setting into the existing features table:

```toml
[features]
hooks = true
```

Run a normal Codex turn and open Langfuse's Traces and Sessions views.
For older Codex releases, inspect `codex features list`; historical hook feature
names differ. See [Codex hook documentation](https://developers.openai.com/codex/hooks).

### Global hook, project-specific configuration

A global hook can read different settings in each project. For example:

```text
~/.codex/
  hooks.json                   # global Stop registration
  langfuse.yaml                # default endpoint and credentials
  hooks/x-langfuse/index.mjs

my-project/.codex/
  langfuse.yaml                # project overrides, e.g. tags or enabled: false
```

You do not need a project hook just to override the YAML. Alternatively install
only a project hook to limit collection to that project. **Choose one hook
registration per session**: Codex runs matching global, project and plugin hooks
additively; they do not override each other. Disable the upstream tracing plugin
if you switch to this plugin. Concurrent duplicate hook registrations can race
and produce duplicate exports.

Project configuration uses the hook payload's `cwd` (or the process cwd). From a
subdirectory, it finds the nearest ancestor `.codex`, stopping at a Git root or
the user's home boundary. Multiple ancestor project directories are not merged.

## Alternative: install as a Codex plugin

The repository includes a Codex marketplace and a plugin with a bundled Stop hook:

```bash
codex plugin marketplace add yunhungo/x-langfuse-chatgpt
```

Open `/plugins`, select this marketplace and install **x Langfuse** (`tracing`).
Enable it globally or in a trusted project's `config.toml`:

```toml
[plugins."tracing@x-langfuse-chatgpt"]
enabled = true
```

Review the hook in `/hooks`, then configure the same global or project
`langfuse.yaml` described above. The default `hooks/hooks.json` discovery mechanism
is used; the runtime resolves through Codex's `${PLUGIN_ROOT}` placeholder.
Do not also run the direct installer for that same session.

## YAML and legacy configuration

Configuration precedence, from lowest to highest:

1. Built-in defaults.
2. Global `langfuse.json`, then `langfuse.yml`, then `langfuse.yaml`.
3. Project `langfuse.json`, then `langfuse.yml`, then `langfuse.yaml`.
4. Environment variables.

All global files live directly in `$CODEX_HOME`, defaulting to `~/.codex`.
Layering is a shallow field merge: arrays and metadata objects replace the earlier
value. YAML supports comments and `${VARIABLE_NAME}` references inside string
values. References are expanded after parsing, so a variable cannot inject YAML
structure. An unset reference, duplicate key, unknown YAML field or invalid type
aborts that export with a sanitized diagnostic. YAML uses native booleans/numbers.
Legacy JSON retains upstream coercion and malformed-file fallback behavior.

```yaml
enabled: true
public_key: pk-lf-replace-me
secret_key: "${MY_OPTIONAL_SECRET_VARIABLE}"
base_url: https://us.cloud.langfuse.com
environment: development
user_id: developer-alias
tags: [codex, engineering]
metadata:
  team: platform
  repository: example
max_chars: 20000
debug: false
fail_on_error: false
redact_patterns:
  - "customer-[0-9]+"
```

See [examples/langfuse.yaml](examples/langfuse.yaml) for a copyable template.

| YAML / JSON field | Environment variable                                         | Default                              |
| ----------------- | ------------------------------------------------------------ | ------------------------------------ |
| `enabled`         | `TRACE_TO_LANGFUSE`                                          | `false`                              |
| `public_key`      | `LANGFUSE_CODEX_PUBLIC_KEY`, `LANGFUSE_PUBLIC_KEY`           | unset                                |
| `secret_key`      | `LANGFUSE_CODEX_SECRET_KEY`, `LANGFUSE_SECRET_KEY`           | unset                                |
| `base_url`        | `LANGFUSE_CODEX_BASE_URL`, `LANGFUSE_BASE_URL`               | `https://cloud.langfuse.com`         |
| `environment`     | `LANGFUSE_CODEX_ENVIRONMENT`, `LANGFUSE_TRACING_ENVIRONMENT` | unset                                |
| `user_id`         | `LANGFUSE_CODEX_USER_ID`                                     | local Codex auth email, if available |
| `tags`            | `LANGFUSE_CODEX_TAGS`                                        | unset                                |
| `metadata`        | `LANGFUSE_CODEX_METADATA`                                    | unset                                |
| `trace_seed`      | `LANGFUSE_CODEX_TRACE_SEED`                                  | unset                                |
| `max_chars`       | `LANGFUSE_CODEX_MAX_CHARS`                                   | `20000`                              |
| `debug`           | `LANGFUSE_CODEX_DEBUG`                                       | `false`                              |
| `fail_on_error`   | `LANGFUSE_CODEX_FAIL_ON_ERROR`                               | `false`                              |
| `redact_patterns` | configuration file only                                      | `[]`                                 |

Scoped environment names win over their standard equivalent. `LANGFUSE_CODEX_HOST`
and `LANGFUSE_HOST` are fallback URL aliases when neither BASE_URL variable is set.
Environment tags accept JSON arrays or comma-separated strings; metadata accepts
JSON. YAML metadata values must be strings. Use `user_id: ''` to omit identity.

### Compatibility with the official plugin

Existing global/project `.codex/langfuse.json` files work without conversion;
all documented upstream configuration fields are retained. To migrate to YAML,
use the same field names and native YAML values. Keep just one format per scope
where possible to make configuration easier to understand.

This plugin additionally respects `CODEX_HOME` for global tracing configuration,
resolves project config from hook cwd, validates YAML strictly, redacts exports
and delays completion receipts until network export succeeds.

## Reliability and limitations

- The original transcript is the retry source. Completed turn IDs are appended
  to `<rollout>.langfuse` only after successful export. A failed upload remains
  eligible on the next Stop invocation or manual replay.
- Delivery is **at least once**, not exactly once. Partial network success, a
  crash between export and receipt, concurrent hooks, or an unwritable sidecar
  can create duplicates. No background retry worker is installed.
- Sidecars are shared with the upstream integration and are not endpoint-scoped.
  When intentionally re-exporting to another Langfuse project, back up/remove the
  relevant sidecar first. This can duplicate traces at a previously used target.
- SDK exports have a five-second request timeout; the Stop hook has a 30-second
  overall budget. Very large transcripts or slow networks can exceed this budget.
- In-progress turns have no completion receipt and may appear again when finalized.
- Use a unique `trace_seed` per session for predictable trace IDs. Turn N uses
  SHA-256 of `<seed>:<N>`, truncated to 32 hexadecimal characters. Independent
  subagent threads include their thread ID in the seed. This groups retried
  exports into the same trace ID but does not deduplicate individual observations.
- Missing child rollouts, unknown transcript events and unavailable usage remain
  absent; the parser does not fabricate them. Subagent nesting follows upstream
  behavior, including possible dispatch tool and child execution observations.

## Privacy

Configured Langfuse credentials and common API-key prefixes are masked before
HTTP export. `redact_patterns` adds global JavaScript regular expressions applied
to exported names, attributes and status messages. `max_chars` caps strings in
inputs/outputs, including nested tool arguments, before export.

These controls are not a complete DLP system: prompts, source code, paths, tool
outputs and personal data may still be sent. Arbitrary regex patterns should be
reviewed for performance and can alter serialized structured values. Nothing is
sent to the plugin maintainer. See [PRIVACY.md](PRIVACY.md).

## Troubleshooting

- **No hook execution:** restart Codex, check `/hooks`, trust the current hook hash,
  and ensure the project and hooks feature are enabled. Plugin installation alone
  does not grant hook trust.
- **No export:** check `enabled`, both keys and the endpoint in the effective YAML.
  A desktop-launched process may not inherit terminal environment variables;
  direct YAML credentials avoid that dependency.
- **Wrong configuration:** check higher-priority project files and environment
  variables. Avoid keeping both YAML and JSON with conflicting settings.
- **Authentication/region error:** public and secret keys must belong to the same
  project and endpoint. For self-hosting, use the instance base URL, not an API path.
- **Connectivity failure:** allow the configured endpoint through the Codex
  sandbox/network policy. Inspect stderr with `debug: true` and use
  `fail_on_error: true` for diagnostics. Successful transport is not a guarantee
  that Langfuse has finished indexing the trace.
- **Config error:** YAML diagnostics deliberately omit values. Check syntax,
  field names/types and referenced environment variables locally.
- **Duplicates:** remove duplicate global/project/plugin hook registrations and
  check sidecar write permissions.

Manual replay (uploads data when your selected config is enabled):

```bash
printf '%s' '{"hook_event_name":"Stop","cwd":"/path/to/project","transcript_path":"/path/to/rollout.jsonl"}' \
  | node plugins/tracing/dist/index.mjs
```

## Development and verification

```bash
pnpm install --frozen-lockfile
pnpm test              # builds bundle, runs parser/config/HTTP/install tests
pnpm run lint          # formatting, strict TypeScript check, build
pnpm run build         # regenerate the committed standalone runtime
```

Tests use synthetic upstream fixtures and an ephemeral loopback HTTP receiver.
They exercise actual subprocess execution, authentication failure, retry after
recovery, completion receipts, no-repeat export, masking, YAML precedence and
installer preservation. No production Langfuse credentials or real conversations
are needed. A real Langfuse server's ingestion and UI are a separate deployment
smoke test, not asserted by the mock HTTP receiver. CI runs on Linux and macOS.

```text
plugins/tracing/
  .codex-plugin/plugin.json
  hooks/hooks.json
  src/                  # configuration, parser, tracing, privacy, transport
  test/                 # fixtures and behavioral tests
  dist/index.mjs        # shipped standalone runtime
scripts/install-hooks.mjs
examples/langfuse.yaml
.agents/plugins/marketplace.json
```

### Updating and uninstalling

After pulling an update, rerun the direct installer to refresh its runtime copy,
or update the plugin through Codex. Changed hook definitions require trust review.

For direct installations, remove only this plugin's handler from `hooks.json`,
then optionally remove `hooks/x-langfuse/`. Keep unrelated hooks. For marketplace
installation, disable/uninstall it through `/plugins`. Keep or remove your YAML
as desired. Uninstalling does not delete stored Langfuse traces.

## License and references

MIT; see [LICENSE](LICENSE) and [NOTICE](NOTICE).

- [Codex hooks](https://developers.openai.com/codex/hooks)
- [Official Langfuse Codex integration](https://langfuse.com/integrations/developer-tools/codex)
- [Langfuse instrumentation and masking](https://langfuse.com/docs/observability/sdk/advanced-features)
- [Langfuse trace quality guidance](https://langfuse.com/docs/observability/best-practices)
