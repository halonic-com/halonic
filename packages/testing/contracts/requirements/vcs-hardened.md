# contracts.vcs-hardened

- Status: draft
- Since: 0.1.0
- Source: HAL-181; HAL-9 plan section 11 (the git adapter always runs hardened), decided on HAL-181; `Vcs` port v1

Where a `Vcs` adapter drives git, it shall run every git command so that no program planted in the repository runs, whether the workspace is trusted or not: no hook, no `core.fsmonitor` command, no filter, external diff, textconv or signing program, no upload-pack, receive-pack, ssh, credential or askpass program named in the repository's config, and no `ext::` URL. The `Vcs` port doc lists how. An adapter that drives git shall give the suite a way to plant them; one that runs no git, such as the memory adapter, declares so and the cases are skipped.

Draft until the first adapter that drives git passes it: the memory adapter runs no programs, so its pass shows only that the cases run. A self-test with a plant that reports it ran shows every case fails then.

## Examples

- Given a repository with every hook the port's commands could start planted in `.git/hooks` and in a `core.hooksPath` set in the repository's config,
  when files are diffed, staged, unstaged, discarded and committed, and a branch is created and checked out,
  then no planted hook has run.
- Given a repository whose config sets `core.fsmonitor`, filter, diff, textconv and gpg programs, with attributes that apply the filter and diff drivers to every file, and turns on signed commits and signatures in the log,
  when the same commands run,
  then no planted program has run.
- Given two clones of one remote with those programs planted, and upload-pack, receive-pack, credential and askpass programs and signed pushes set as well,
  when one pushes a commit and the other pulls it,
  then the pull brings the change and no planted program has run.
- Given one clone whose remote is an `ext::` URL with `protocol.ext.allow` set to `always`, and one whose remote is an ssh URL with a planted `core.sshCommand`,
  when each pulls and pushes,
  then no planted program has run, whether or not the calls fail.
