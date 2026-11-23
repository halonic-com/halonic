# cli.commands.init.package-examples

- Status: active
- Since: unreleased
- Source: HAL-16911 (hardening of the npm package's folders); `cli.commands.init.copy-example`; `publish.staged-cli`

When the CLI runs from the npm package, the `halonic init --example` command shall copy an example only from the `examples` folder the package ships beside its `dist` folder, and never look for one in the folders around the package. When it runs from the repository, it shall copy from the repository's `examples` folder.

## Examples

- Given the CLI bundled in the npm package at `node_modules/halonic/dist/cli`,
  then the examples folder is `node_modules/halonic/examples`.
- Given the CLI in the repository at `apps/cli/src/commands/init`,
  then the examples folder is the repository's `examples`.
- Given the npm package installed in a project, and an `examples/acme` folder in a folder around the package,
  when `halonic init --example acme` runs,
  then the copy holds the package's own Acme example.
