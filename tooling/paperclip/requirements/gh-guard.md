# paperclip.gh-guard

- Status: active
- Since: unreleased
- Source: HAL-16401, lever L1b of the part 1 plan on HAL-15920: status reads with `gh` cost about 19% of seat tokens, and `pr_status` / `my_prs` answer them in one call

When an agent's run calls `gh pr view`, `gh pr checks`, `gh pr list`, `gh pr status`, `gh run view` or `gh run list` to read the status of a pull request or a CI run on `halonic-com/halonic`, and the Agent tools plugin answers that the guard is on, the `gh` wrapper shall print the tool call that replaces it (`pr_status` with the pull request's number when the call names one, or `my_prs`) and how to load it, and exit with 1 without running `gh`. It shall run `gh` unchanged, with its arguments, input, output and exit code, for any other command or repository, for reads no tool answers (a description or comments, other `--json` fields, a failure log, another workflow's runs, a filtered or closed list, the web view), outside an agent's run, and whenever the plugin is off, doesn't answer within 1.5 s or can't be asked.

## Examples

- Given an agent in a clone of `halonic` whose plugin has the guard on,
  when it runs `gh pr checks 5208`,
  then it reads `pr_status({"pr": 5208})` and `gh` doesn't run.
- Given the same agent,
  when it runs `gh pr list --json number,headRefName`,
  then it reads `my_prs()`.
- Given the same agent,
  when it runs `gh pr view 5208 --json body` or `gh run view 99 --log-failed`,
  then `gh` runs as it is and the plugin isn't asked.
- Given an agent that runs `gh pr checks 12 -R cli/cli`,
  when the wrapper looks at it,
  then `gh` runs as it is.
- Given the plugin answers 404 because its installed version has no guard route,
  when an agent runs `gh pr checks 5208`,
  then `gh` runs and its exit code is the wrapper's.
