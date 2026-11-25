# paperclip.workspace-runtime-today

- Status: active
- Since: unreleased
- Source: HAL-17949; Liam on HAL-17451 (the defaults are tested against today's behaviour) and on HAL-17985 (that test stays in `tooling/paperclip`, the runtime is a generic package)

When an agent calls `pr_status` or `my_prs` on the Paperclip plugin runtime with today's tools as its snapshot and action handlers, the answer and the GitHub requests shall be the ones the Agent tools plugin gives for the same call, the same settings and the same GitHub answers.

## Examples

- Given a read token and GitHub's answers for #4605,
  when an agent calls `pr_status` with `4605`, with a pull request on a repository the tools don't read, or with a value that isn't a number,
  then each answer and each request is the one Agent tools gives.
- Given Mateo with one open pull request,
  when Mateo calls `my_prs`,
  then the answer and the requests are the ones Agent tools gives.
