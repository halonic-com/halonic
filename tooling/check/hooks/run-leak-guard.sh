# Shared by the pre-commit and pre-push hooks: runs the leak guard with the
# repo's own Node when `pnpm install` has fetched it, otherwise with the
# Node on PATH. Sourced, not run, so "$@" are the hook's own arguments.

hooks_dir=$(dirname "$0")
repo_root=$(git rev-parse --show-toplevel)
node="$repo_root/node_modules/.bin/node"
if [ ! -x "$node" ]; then
  node=node
elif ! "$node" --version >/dev/null 2>&1; then
  # The fetched Node can fail to start, for example when a system library
  # it needs is missing. Fall back rather than leave the hook unusable.
  echo "leak guard: the repo's Node.js does not start here; using the Node.js on PATH." >&2
  node=node
fi
if ! command -v "$node" >/dev/null 2>&1; then
  echo "leak guard: Node.js not found. Run pnpm install, then try again." >&2
  exit 1
fi
if ! "$node" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo "leak guard: the Node.js on PATH is too old; it must be version 24 or newer to run TypeScript files. Run pnpm install to fetch the repo's Node.js, or update yours." >&2
  exit 1
fi
