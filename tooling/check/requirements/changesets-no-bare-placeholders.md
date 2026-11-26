# check.changesets-no-bare-placeholders

- Status: active
- Since: unreleased
- Source: HAL-19604

If the text of a changeset in `.changeset/` (not its front matter) has `<` followed by a letter outside an inline code span, a fenced code block or an autolink, then the `changesets` check shall fail, name the file and line, and say to write placeholders as `{name}` or put the command in backticks. The release notes copy the changelog unescaped into the GitHub release and `latest.json`, and GitHub drops a bare `<word>` as an HTML tag.

## Examples

- Given a changeset whose text says `"<Agent> is typing…"`, then the check fails on that line.
- Given a changeset whose text says `` `halonic deploy <deployment>` ``, then the check passes.
- Given a changeset whose text says `{name}`, then the check passes.
- Given a changeset whose text has the autolink `<https://halonic.dev>`, then the check passes.
- Given a changeset with `<x>` inside a fenced code block, then the check passes.
