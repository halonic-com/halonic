# app.plugin-program-secret-text

- Status: active
- Since: unreleased
- Source: HAL-12638 (Nina's C54 docs check on HAL-12634, item P20); the wording was decided by the team on HAL-12638

The app shall give one text for where a plugin program's secret goes, which `halonic plugin add` and Studio's trust check both show after the secret's name: the program that gets it and as which environment variable, then where that program may connect, as "given to *program* as *VARIABLE*; *program* can reach *hosts*", or "*program* can't reach the internet" when its `network` lists no host. When none of the program's variables takes the secret, the text shall say the program doesn't get it. A backend's secret shall keep "goes only to *hosts*", because Halonic's kit puts it in each request and the plugin's code never sees it.

## Examples

- Given the program `files` with `env: { LF_TOKEN: { secret: lf-token } }` and `network: [api.example.com]`,
  when the text of `lf-token` is read,
  then it is "given to files as LF_TOKEN; files can reach api.example.com".
- Given the same program with no `network`,
  when the text of `lf-token` is read,
  then it ends "files can't reach the internet".
- Given a plugin with that program and no backend,
  when `halonic plugin add` shows its trust check,
  then the Secrets row is "lf-token  given to files as LF_TOKEN; files can reach api.example.com", and Studio's dialog shows the same text under the secret's name.
