# git.run-checkout-install

- Status: active
- Since: 0.1.0
- Source: HAL-3125 part 2b (step 3 of HAL-3023); plan section 4.5

The git adapter shall install a run checkout's dependencies on the host, before the sandbox starts, with `pnpm install --frozen-lockfile --prefer-offline --ignore-scripts`, started by its absolute path with no shell, in the checkout, with an environment cut to the `PATH`, the home folder and the network settings. The checkout holds files from earlier runs' commits, so the install shall also run no `.pnpmfile.cjs`, never switch to the pnpm version a `packageManager` field names (including through corepack), and take its registry from the host (the npm registry unless given), not from the checkout's `.npmrc` or `pnpm-workspace.yaml`. Other settings of those files still apply; the lockfile's integrity hashes guard what is fetched, and this is the chosen alternative to refusing files that differ from the trusted base. It shall refuse a folder that isn't absolute, and fail with the end of pnpm's output (stdout and stderr) when the install fails.

## Examples

- Given a run checkout,
  when its dependencies are installed,
  then pnpm runs in the checkout with the frozen-lockfile, offline-first and no-scripts arguments.
- Given an environment with an `npm_config_registry` variable,
  when its dependencies are installed,
  then pnpm doesn't get that variable.
- Given a pnpm that exits with an error,
  when its dependencies are installed,
  then the install fails and the message holds pnpm's output.
- Given a folder that isn't absolute,
  when its dependencies are installed,
  then it is refused.
- Given a checkout with a `.pnpmfile.cjs`, a `packageManager` field and an `.npmrc` that names another registry,
  when its dependencies are installed,
  then no hook runs, the pnpm that was started stays, and the host's registry is used.
