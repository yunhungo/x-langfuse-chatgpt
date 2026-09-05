# Privacy and data handling

This plugin sends data only to the Langfuse endpoint you configure. The plugin
maintainer does not operate a collection endpoint or receive telemetry.

Tracing is disabled by default. Once enabled, transcript-derived prompts,
assistant text, available reasoning summaries, tool arguments/results/errors,
model identifiers, token usage, timestamps, thread/turn identifiers, user ID,
tags and metadata are sent to your Langfuse project.

The upstream-compatible default user ID is the email claim in the local Codex
ID token, if available. The token itself is never exported. Set `user_id` to a
pseudonym, or to an empty string to omit user identification.

Configured Langfuse keys and common Langfuse/OpenAI/GitHub key prefixes are
redacted from exported span attributes, names and status messages. Optional
`redact_patterns` apply additional JavaScript regular expressions. Redaction is
best effort, not a complete secret or personal-data detector. Arbitrary source
code, shell output, file paths and personal data can remain visible. Truncation
is not redaction. Avoid enabling tracing for data unsuitable for your endpoint.

No separate transcript copy is created. A small `.langfuse` sidecar next to the
original transcript records completed turn IDs after successful export. The
installer backs up existing hooks and stores a local copy of the bundled runtime.

Use restrictive permissions for credential YAML files (for example `chmod 600`),
exclude them from Git, and use HTTPS for remote endpoints. HTTP is supported for
local testing and self-hosted development. Your Langfuse service controls retention,
access and deletion of uploaded data. Set `enabled: false` to stop future exports;
this does not delete existing Langfuse traces or local Codex transcripts.
