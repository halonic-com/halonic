# cli.commands.serve.npm-package-page

- Status: active
- Since: unreleased
- Source: HAL-16911 (hardening of the npm package's folders); `cli.commands.serve.serve`; `server.studio-page`

When the CLI runs from the npm package, which doesn't ship the Studio page, the `halonic serve` command shall look for the page in no folder, serve the API, answer 404 at `/`, and print the line "The Studio page doesn't come with the npm package, so the address shows no page." under the "Serving" line, where the line for a page that isn't built would be. When it runs from the repository, it shall read the page from `apps/studio/dist/studio` as `cli.commands.serve.serve` says.

## Examples

- Given the CLI bundled in the npm package,
  then `serve` has no Studio page folder and no Studio app folder.
- Given the CLI in the repository,
  then the page folder is `apps/studio/dist/studio` and the app folder is `apps/studio`.
- Given no Studio page folder, when `halonic serve` starts,
  then it serves the API, `GET /` answers 404, and the third line says the page doesn't come with the npm package.
