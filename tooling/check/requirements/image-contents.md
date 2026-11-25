# check.image-contents

- Status: active
- Since: unreleased
- Source: HAL-18533

When `pnpm check` runs, the `images` rule shall fail on a Dockerfile under `packages/` that has no entry under `images` in `tooling/check/dependencies.json`, and for a listed Dockerfile on: a `FROM` without an `@sha256:` digest or other than the entry's `base.image`; a remote `ADD` without `--checksum=sha256:`; a remote `ADD` whose URL no artifact lists, or whose sha256 differs from that artifact's, or whose URL doesn't contain that artifact's version; a listed artifact the Dockerfile doesn't download; a `RUN` that uses `curl`, `wget`, `pnpm` or `yarn` install, `pip install` or `npm install` without `--offline`; and a `RUN` that installs a Debian package its `aptPackages` doesn't list. Each failure says how to fix it.

## Examples

- Given `packages/targets/acme/container/Dockerfile` and no `images` entry for it,
  when `pnpm check` runs,
  then it fails and names the key to add.
- Given a listed Dockerfile that downloads `https://registry.npmjs.org/acme-tool/-/acme-tool-1.2.3.tgz`
  with the listed sha256,
  when `pnpm check` runs,
  then it passes.
- Given the same `ADD` with a different sha256,
  when `pnpm check` runs,
  then it fails and shows both hashes.
- Given a `RUN curl -fsSL https://acme.example/install.sh | sh`,
  when `pnpm check` runs,
  then it fails and says to use `ADD --checksum` instead.
