# app.run-proposal-trust

- Status: active
- Since: 0.1.0
- Source: HAL-65 section F, `workspace.trust.assistant-no-git-or-halonic` and `workspace.trust.review-starts-nothing`; HAL-3341; HAL-3353; HAL-3248

When the person accepts a run's proposal, the proposal service shall refuse every file whose path is inside `.git/` or `.halonic/`, compared the way Windows and macOS open each part of it, any path the assistant may never write, and any path the workspace's store won't serve, such as one through a symlink. A refused file shall be listed under `refused` with why (`under-git`, `under-halonic` or `outside-workspace`), marked not applicable and kept in the proposal, and nothing of it shall be written. Accepting shall start nothing.

## Examples

- Given run `01JD8Q`'s proposal carries `.git/hooks/post-checkout` and `agents/clerk.agent.yaml`,
  when the person picks Accept all,
  then `.git/hooks/post-checkout` is refused as `under-git` and marked not applicable, `agents/clerk.agent.yaml` is written, and no hook file exists.
- Given a proposed file `.Halonic./proposals/x.json` or `hubs/h/.halonic/x`,
  when the person accepts it,
  then it is refused as `under-halonic`.
- Given a store that refuses `notes/link/today.md` because `link` is a symlink,
  when the person accepts that file,
  then it is refused as `outside-workspace` and nothing is written.
