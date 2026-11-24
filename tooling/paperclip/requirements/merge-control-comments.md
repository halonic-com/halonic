# paperclip.merge-control-comments

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 21 Nov 05:00; HAL-16399; HAL-14420

When the plugin comments on a pull request, it shall post each kind of note at most once per head, use only the Merger's fixed texts with no `@` name, tell a clean, green pull request that waits only for an approval, and tell an approved, green one GitHub shows as blocked.

## Examples

- Given a clean, green pull request without an approval,
  when two passes run and then one on a new head,
  then the note is posted on the first and the third.
- Given an approved, green pull request GitHub shows as blocked,
  when a pass runs,
  then the blocked note is posted.
- Given every comment text,
  when they are read,
  then none has an `@` name.
