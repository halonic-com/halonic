# Shared by the pre-commit and pre-push hooks: runs the leak guard with the
# repo's own Node when `pnpm install` has fetched it, otherwise with the
# Node on PATH. Sourced, not run, so "$@" are the hook's own arguments.

hooks_dir=$(dirname "$0")
repo_root=$(git rev-parse --show-toplevel)
node="$repo_root/node_modules/.bin/node"
if [ ! -x "$node" ]; then
  node=node
fi
if ! command -v "$node" >/dev/null 2>&1; then
  echo "leak guard: Node.js not found. Run pnpm install, then try again." >&2
  exit 1
fi
