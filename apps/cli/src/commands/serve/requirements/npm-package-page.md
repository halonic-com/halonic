# cli.commands.serve.npm-package-page

- Status: active
- Since: unreleased
- Source: HAL-16911 (hardening of the npm package's folders); HAL-19285 (the way in, and the page a browser gets); `cli.commands.serve.serve`; `server.studio-page`

When the CLI runs from the npm package, which doesn't ship the Studio page, the `halonic serve` command shall look for the page in no folder, serve the API, answer 404 at `/`, and print the line "Open it from the Halonic app on your phone: run halonic serve pair to add it. The Studio page for a browser doesn't come with the npm package." under the "Serving" line, where the line for a page that isn't built would be. A `GET` or `HEAD` of `/` whose `Accept` header asks for `text/html` shall get a plain HTML page with that same line, with no script or style, instead of the 404; every other path and request shall get the server's own answer. When it runs from the repository, it shall read the page from `apps/studio/dist/studio` as `cli.commands.serve.serve` says.

## Examples

- Given the CLI bundled in the npm package,
  then `serve` has no Studio page folder and no Studio app folder.
- Given the CLI in the repository,
  then the page folder is `apps/studio/dist/studio` and the app folder is `apps/studio`.
- Given no Studio page folder, when `halonic serve` starts,
  then it serves the API, `GET /` answers 404, and the third line names the phone app and `halonic serve pair`.
- Given no Studio page folder, when a browser asks for `/` with `Accept: text/html`,
  then it gets a 200 HTML page with that line, and `/api/nothing` still answers the JSON 404.
