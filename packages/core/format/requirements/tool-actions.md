# format.tool-actions

- Status: active
- Since: unreleased
- Source: HAL-17948, HAL-18141 (plan HAL-17450 rev 5, "Generic actions, company settings" and "Safety"); HAL-17956 (the writing actions, Liam's decisions on that task)

The format shall list every action a workspace tool can run, each with what it does, whether it writes and which keys the plugin's installer gives it (`github-read` or `paperclip-api`): `github.pull-request`, `github.open-pull-requests`, `github.merge-queue` and `github.merge-times`, which need `github-read` and the `repositories` (1 to 20, each `owner/name`) they may read, the last with `days` (1 to 90, default 7), and `paperclip.task` and `paperclip.failed-runs`, which need `paperclip-api`, the last with `hours` (1 to 168, default 24), and `paperclip.template`, which needs no key and no setting and reads the snapshot's templates; and the writing actions `paperclip.comment`, `paperclip.next-step` and `paperclip.finish-run`, which need `paperclip-api` and take one setting, `mode`, either `dry-run` (the default) or `write`. Only these three write. When a tool file's `action.run` names an action that isn't in the list, or its `action.with` holds a key the action doesn't take, the format shall refuse the file. `action.with` may be left out only when every setting of the action has a default. A workspace can't add an action; a new one is a change to this list.

## Examples

- Given the list, when its names and keys are read, then they are the ten actions above in that order, and only the last three write.
- Given `run: shell.run`, when it is parsed, then it fails at `action.run`.
- Given `run: github.pull-request` without `with`, when it is parsed, then it fails at `action.with`.
- Given `run: paperclip.failed-runs` without `with`, when it is parsed, then `with` is `{ hours: 24 }`.
- Given `run: paperclip.comment` without `with`, when it is parsed, then `with` is `{ mode: dry-run }`.
- Given `run: paperclip.comment` with `mode: always`, when it is parsed, then it fails at `action.with.mode`.
- Given a repository written as `https://github.com/acme/website`, when it is parsed, then it fails at `action.with.repositories[0]`.
