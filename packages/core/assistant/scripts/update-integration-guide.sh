#!/bin/sh
# Refreshes our pinned copy of the integration guide (HAL-18266) from
# halonic-com/integrations at one commit. A person runs it and reviews the
# diff like any other change; the Build chat never fetches the guide.
#
#   pnpm --filter @halonicjs/assistant run update-integration-guide <commit> [integrations clone]
#
# The clone defaults to $INTEGRATIONS_CLONE, else an `integrations` folder
# next to this repository. Fetch the commit into it first. Both files are
# written to temporary files first, so a failed read leaves the copy as it was.
set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: update-integration-guide <commit> [integrations clone]" >&2
  exit 2
fi

package=$(cd "$(dirname "$0")/.." && pwd)
clone=${2:-${INTEGRATIONS_CLONE:-$package/../../../../integrations}}
commit=$(git -C "$clone" rev-parse --verify "$1^{commit}")
folder=$package/src/build/integration-guide
guide=$(mktemp)
trap 'rm -f "$guide" "$folder/guide.generated.ts.tmp" "$folder/source.ts.tmp"' EXIT

git -C "$clone" show "$commit:docs/guides/integrations.md" >"$guide"
node "$package/scripts/integration-guide-module.ts" guide <"$guide" >"$folder/guide.generated.ts.tmp"
node "$package/scripts/integration-guide-module.ts" source "$commit" <"$guide" >"$folder/source.ts.tmp"
mv "$folder/guide.generated.ts.tmp" "$folder/guide.generated.ts"
mv "$folder/source.ts.tmp" "$folder/source.ts"
echo "Pinned the integration guide at $commit."
