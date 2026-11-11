#!/usr/bin/env bash
# The CLI session the network capture watches: the same commands as the
# HAL-6488 trace, from a clean home folder. First Acme on the test model,
# then a copy of Acme pointed at a model server on 127.0.0.1. Every command's
# output goes to the log; a failing command doesn't stop the session.
# Usage: session.sh <scratch folder>. HALONIC_CLI is the CLI's main.ts.
set -u
scratch="$1"
here="$(cd "$(dirname "$0")" && pwd)"
export HOME="$scratch/home"
unset HALONIC_HOME XDG_CONFIG_HOME XDG_DATA_HOME XDG_STATE_HOME XDG_CACHE_HOME
mkdir -p "$HOME" "$scratch/work"
cd "$scratch/work"

halonic() { node "$HALONIC_CLI" "$@"; }
step() {
  echo "\$ halonic $*"
  halonic "$@" </dev/null
  echo "exit code: $?"
  echo
}
fingerprint() {
  halonic trust --json </dev/null |
    node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>console.log(JSON.parse(s).error?.fingerprint??""))'
}
trust() {
  step trust
  step trust --yes --fingerprint "$(fingerprint)"
}

step --help
step init empty
step init acme --example acme
cd acme
step validate
trust
step trust --list
step doctor
step test
step routines
step run support-reply --input examples/refund-question.json
step runs
step schema

echo "## Acme on a model server on 127.0.0.1"
cd "$scratch/work"
cp -R acme acme-local
cd acme-local
STUB_LOG="$scratch/model-stub.log" STUB_PORT_FILE="$scratch/model-stub.port" node "$here/model-stub.mjs" &
stub=$!
for _ in $(seq 50); do [ -s "$scratch/model-stub.port" ] && break; sleep 0.2; done
port="$(cat "$scratch/model-stub.port")"
cat > providers/local-llm.yaml <<YAML
id: local-llm
name: Local model server
type: openai-compatible
baseUrl: http://127.0.0.1:$port/v1
local: true
YAML
cat > models.yaml <<'YAML'
aliases:
  default:
    description: The model server on 127.0.0.1.
    provider: local-llm
    model: stub
YAML
step validate
trust
step doctor
step run support-reply --input examples/refund-question.json
step runs
kill "$stub"
echo "## Model server log"
cat "$scratch/model-stub.log"
