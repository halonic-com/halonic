#!/usr/bin/env bash
# Runs Codex and Claude Code once each against the fake model server, with
# their own sandboxes asked for, and has each run one command that writes in
# the working folder and in the home folder. Prints what happened.
set -u
# macOS has no `timeout`; perl's alarm does the same.
command -v timeout >/dev/null || timeout() { local s="$1"; shift; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }
here="$(cd "$(dirname "$0")" && pwd)"
scratch="${RUNNER_TEMP:-/tmp}/cli-probe"
rm -rf "$scratch"; mkdir -p "$scratch/work" "$scratch/codex-home" "$scratch/claude-config"
cd "$scratch"
probe_script="$(node -e 'console.log(process.argv[1].replace(/\\/g, "/"))' "$here/probe-write.mjs")"
export PROBE_COMMAND="node \"$probe_script\""
export PROBE_LOG="$scratch/fake-model.log" PROBE_PORT_FILE="$scratch/fake-model.port"
node "$here/fake-model.mjs" & server=$!
for _ in $(seq 50); do [ -s "$PROBE_PORT_FILE" ] && break; sleep 0.2; done
port="$(cat "$PROBE_PORT_FILE")"
cd "$scratch/work"

for mode in workspace-write danger-full-access; do
echo "### Codex $(codex --version) with -c sandbox_mode=\"$mode\""
CODEX_HOME="$scratch/codex-home" PROBE_KEY=unused timeout 120 codex exec --skip-git-repo-check --json \
  -c model_provider=probe \
  -c "model_providers.probe={name=\"probe\",base_url=\"http://127.0.0.1:$port/v1\",wire_api=\"responses\",env_key=\"PROBE_KEY\"}" \
  -c model=gpt-5.4 -c approval_policy='"on-request"' -c "sandbox_mode=\"$mode\"" \
  "run the probe" </dev/null > "$scratch/codex.jsonl" 2> "$scratch/codex.stderr"
echo "exit code: $?"
grep -E 'command_execution|approval|error|turn\.' "$scratch/codex.jsonl" | cut -c1-600
echo "stderr (last lines):"; tail -n 5 "$scratch/codex.stderr" | cut -c1-300
done

echo '{"sandbox":{"enabled":true,"autoAllowBashIfSandboxed":false}}' > "$scratch/sandbox.json"
for extra in "" "--allowedTools Bash"; do
  echo "### Claude Code $(claude --version) with --settings sandbox.enabled=true ${extra:-(no tools allowed)}"
  # shellcheck disable=SC2086
  CLAUDE_CONFIG_DIR="$scratch/claude-config" ANTHROPIC_BASE_URL="http://127.0.0.1:$port" ANTHROPIC_API_KEY=unused \
    timeout 120 claude -p --output-format stream-json --verbose --setting-sources user \
    --settings "$scratch/sandbox.json" $extra --model claude-sonnet-5-5 "run the probe" \
    </dev/null > "$scratch/claude.jsonl" 2> "$scratch/claude.stderr"
  echo "exit code: $?"
  grep -E '"tool_result"|"type":"result"' "$scratch/claude.jsonl" | cut -c1-600
  echo "stderr:"; cut -c1-300 "$scratch/claude.stderr" | head -n 10
done

echo "### Fake model server log"
cat "$PROBE_LOG"
kill "$server" 2>/dev/null
