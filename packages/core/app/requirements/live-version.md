# app.live-version

- Status: active
- Since: 0.1.0
- Source: save model 2.2–2.3 (HAL-1102, HAL-3236 task 2, HAL-3246): runs other than Try it and Test read the latest version; a workspace without history uses the saved files everywhere

When the live version of a workspace is asked, the app shall answer `history-off` when there is no version control or the folder isn't a repository, `none-yet` when the repository has no commit, and otherwise the latest commit on the current branch.

## Examples

- Given a workspace opened without version control, or a folder that isn't a repository, then the live version is `history-off`.
- Given a repository without a commit, then it is `none-yet`.
- Given a repository with two commits, then it is the second one.
