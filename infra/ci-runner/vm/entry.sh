#!/bin/bash
# Starts one just-in-time runner (one job, then the container exits and is deleted).
set -euo pipefail
JIT=$(cat /run/halonic-ci/jitconfig)
cd "$HOME/actions-runner"
exec ./run.sh --jitconfig "$JIT"
