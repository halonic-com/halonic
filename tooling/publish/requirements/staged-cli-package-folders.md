# publish.staged-cli-package-folders

- Status: active
- Since: unreleased
- Source: HAL-16911 (hardening of the npm package's folders); `publish.staged-cli`; `cli.commands.init.package-examples`; `cli.commands.serve.npm-package-page`

When the stager bundles the CLI, it shall replace `apps/cli/src/npm-package.ts` so the bundle knows it runs from the npm package, as it replaces `version.ts` with the package's version, and it shall fail when the bundle doesn't import a file it replaces, so a renamed file can't leave the repository's value in the package.

## Examples

- Given the staged package installed into a folder that also holds an `examples/acme` folder around the package,
  when `halonic init --example acme` runs,
  then the copy holds the package's own Acme example, not that folder's.
