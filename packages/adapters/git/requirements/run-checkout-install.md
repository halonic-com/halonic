# git.run-checkout-install

- Status: active
- Since: 0.1.0
- Source: HAL-3125 part 2b (step 3 of HAL-3023); plan section 4.5

The git adapter shall install a run checkout's dependencies on the host, before the sandbox starts, with `pnpm install --frozen-lockfile --prefer-offline --ignore-scripts`, started by its absolute path with no shell, in the checkout, with an environment cut to the `PATH`, the home folder and the network settings. The checkout holds files from earlier runs' commits, so the install shall also run no `.pnpmfile.cjs`, never switch to the pnpm version a `packageManager` field names (including through corepack), and take its registry from the host (the npm registry unless given), not from the checkout's `.npmrc` or `pnpm-workspace.yaml`. The checkout's settings and lockfile are not trusted either: it shall refuse, before pnpm starts, a `pnpm-workspace.yaml` with a setting outside a short list (our own repository's settings and the common dependency ones), one that lists a package folder or patch file outside the checkout, any setting in a checkout `.npmrc`, and a lockfile (or override) with a `link:` or `file:` path, a `file:` tarball or a `directory` resolution that is absolute, leaves the checkout, goes out through a committed link, or doesn't exist. Paths inside the checkout stay allowed, and a project's `link:` starts at the project's folder. Because the sandboxed program can write the lockfile, the next install may fetch only from the pinned registry (and the Node runtime download address): it shall refuse a `git` source, a tarball or download address on another host, and a `registries` setting that names another registry. Refusing is chosen over pinning each folder setting on the command line, because pnpm adds settings over time. It shall also refuse a folder that isn't absolute, and fail with the end of pnpm's output (stdout and stderr) when the install fails.

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
- Given a checkout whose `pnpm-workspace.yaml` sets `virtualStoreDir` or `modulesDir`,
  when its dependencies are installed,
  then it is refused and pnpm doesn't start.
- Given a checkout whose lockfile holds a `file:` dependency, such as `file:../x`, that leaves the checkout,
  when its dependencies are installed,
  then it is refused and pnpm doesn't start.

- Given a checkout with a committed link to a folder of the host, named by a `link:` dependency,
  when its dependencies are installed,
  then it is refused and pnpm doesn't start.
- Given a lockfile that names a tarball or a `git` source on a host other than the pinned registry,
  when its dependencies are installed,
  then it is refused and pnpm doesn't start.
