# check.trace-since-is-released

- Status: active
- Since: unreleased
- Source: HAL-13777

If a requirement's `Since` names a version whose tag `v<version>` doesn't exist, or whose tag doesn't hold the requirement by its path or by its ID, then the trace check shall fail on the requirement file and say to write `Since: unreleased`, unless the checkout has release tags and the version is the app version in `apps/studio/package.json` with no tag yet, which is the release being cut.

## Examples

- Given a requirement that says `Since: unreleased`,
  when the trace check runs,
  then it passes, with release tags or without.
- Given a requirement that says `Since: 0.3.0` and no tag `v0.3.0`,
  when the trace check runs,
  then it fails with "No tag v0.3.0; write "Since: unreleased"".
- Given a requirement that says `Since: 0.1.0`, added after the tag `v0.1.0`,
  when the trace check runs,
  then it fails with "isn't in v0.1.0; write "Since: unreleased"".
- Given a requirement that says `Since: 0.1.0` and is in `v0.1.0` under its path or under its ID,
  when the trace check runs,
  then it passes.
- Given the release pull request, which sets the app version to `0.2.0` and writes `Since: 0.2.0` before the tag exists,
  when the trace check runs,
  then it passes.
- Given a checkout with no release tags at all,
  when a requirement names a version, the app version included,
  then the check fails and says to fetch the tags.
