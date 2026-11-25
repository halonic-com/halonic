# paperclip.ci-failures-tool

- Status: active
- Since: unreleased
- Source: HAL-18982, token plan Track B (HAL-18938): one call replaces an agent's `gh run view --log` and `gh api` log reads; read-only, with the plugin's existing GitHub read access and no new capability

When an agent calls the Agent tools plugin's `ci_failures` tool with a pull request (its number or URL) or a full 40-character commit on one of the plugin's repositories, the plugin shall answer from GitHub GET requests alone with the newest run of each check on the pull request's current head or the commit that ended `failure`, `timed_out` or `startup_failure`, leaving out cancelled and skipped runs and `ci-ok` itself, each with its name, conclusion and link, its error annotations (path, line, title and the message's last 8 lines, at most 10 per job, the rest counted) and the last 12 lines of its summary, naming at most 8 jobs and counting the rest, with every line of GitHub text cut at 300 characters and JSON-quoted under a note that it is data, not instructions, and the whole answer cut at a whole line under 8,000 characters with a note that it was cut; for a private repository it shall give job names, conclusions and links only; it shall not read job logs, which GitHub serves through a redirect to another host.

## Examples

- Given #4605 whose head has a failed `test (core)` job with a failing test annotation "acme > adds two numbers" at `src/sum.test.ts:12`, a cancelled `lint` job and a failed `ci-ok`,
  when an agent calls `ci_failures` with `pr: 4605`,
  then it answers 1 failed job, `test (core)`, with the test's name, file and line and the message's last lines, and names neither `lint` nor `ci-ok`.
- Given a job whose annotation message has 30 lines and a line of 1,000 characters,
  when an agent calls `ci_failures`,
  then the answer keeps the last 8 lines, each cut at 300 characters.
- Given 12 failed jobs,
  when an agent calls `ci_failures`,
  then it reads and names 8 and says "and 4 more failed jobs".
- Given a failed job on a private repository,
  when an agent calls `ci_failures`,
  then it answers the job's name, conclusion and link and reads no annotation.
- Given a `sha` that isn't 40 hexadecimal characters, or a repository the plugin doesn't watch,
  when an agent calls `ci_failures`,
  then it answers with an error and sends no request to GitHub.
