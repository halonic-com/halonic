# check.image-contents

- Status: active
- Since: unreleased
- Source: HAL-18533, HAL-18565

When `pnpm check` runs, the `images` rule shall fail on a Dockerfile (or `Containerfile`) under `packages/` that has no entry under `images` in `tooling/check/dependencies.json`, and for a listed Dockerfile on: a `FROM` without an `@sha256:` digest or other than the entry's `base.image`; an `ADD` whose source holds a variable (`$`); a remote `ADD` without `--checksum=sha256:`; a remote `ADD` whose URL no artifact lists, or whose sha256 differs from that artifact's, or whose URL doesn't contain that artifact's version; a listed artifact the Dockerfile doesn't download; a `COPY --from=` or `RUN --mount=…,from=` that names anything but an earlier stage; a `RUN`, its heredoc body or an `ONBUILD RUN` that uses `curl`, `wget`, `git clone`, `npx`, `npm exec`, `pnpm`, `yarn` or `bun` add or install, `pip`, `gem`, `cargo` or `go` install, `apk add`, `dpkg -i`, or `npm install` without `--offline` (or with a flag that undoes it); and a `RUN` that installs a Debian package its `aptPackages` doesn't list. Each failure says how to fix it. The fetch list catches mistakes, not a determined author; review still reads every `RUN`.

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
- Given `ADD ${TOOL_URL} /build/`,
  when `pnpm check` runs,
  then it fails and says to write the URL out.
