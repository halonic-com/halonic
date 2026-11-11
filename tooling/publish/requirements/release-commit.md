# publish.release-commit

- Status: active
- Since: 0.1.0
- Source: HAL-5259 (tag the release pull request when the merge queue pushes it with others)

The release bot shall tag the commit of a merged release pull request, "chore(release): Halonic <version>" (optionally followed by a task suffix such as "(HAL-4824)"), even when the merge queue pushed that commit to `main` together with other commits, and shall tag nothing when no commit of the push is a release pull request.

## Examples

- Given a push of two commits, the first the merge of the release pull request for 0.1.0 and the last the merge of another pull request,
  when the bot looks for the release,
  then it picks the first commit and its version, 0.1.0.
- Given a push of two commits that merged only ordinary pull requests,
  when the bot looks for the release,
  then it finds none.
- Given a release pull request titled for 0.2.0 whose commit has version 0.1.0 in `apps/studio/package.json`,
  when the bot looks for the release,
  then it finds none: the title and the version at that commit must agree.
