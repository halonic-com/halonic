# publish.staged-cli

- Status: active
- Since: 0.1.0
- Source: HAL-9558 (replace the stub CLI package in release.yml), HAL-9546 (0.1.0 fact-check)

The stager shall build the npm package `halonic` from `apps/cli` for a given version into `tooling/publish/dist/cli`: the CLI and every workspace package and library it imports bundled into one JavaScript file that imports only Node's own modules (Node doesn't run TypeScript inside `node_modules`), `bin/halonic.js` with its Node version check pointed at that bundle, the integration runner file, the `examples` folder, and the sandbox runtime, as the workspace resolves it with our patch, with the dependencies it needs as bundled dependencies. `halonic --version` shall print the given version. It shall fail when the runner file isn't built or when the bundle imports a package that isn't Node's own.

## Examples

- Given the staged package packed and installed into an empty folder with no network,
  when `halonic --version` runs on the Node version the CLI needs,
  then it prints "Halonic" and the staged version.
- Given the same installed package,
  when `halonic doctor` runs,
  then it prints its heading and the disk line, and exits 0 or 1, never with a crash.
- Given the same installed package,
  when `halonic init --example acme` runs,
  then it copies the Acme example from the package's own `examples` folder.
- Given the integration runner file isn't built,
  when the CLI is staged,
  then staging fails and names the build command.
