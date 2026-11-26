# kit.list-meta-end

- Status: active
- Since: unreleased
- Source: Noah's decision on HAL-20018: the Inbox's one-line row keeps "Waiting 1 h" whole

When a row of the kit's `List` without `columns` has a `metaEnd`, it shall come at the end of the meta line and never be cut: on a meta line cut to one line, only the text before it shall be cut with an ellipsis; on a meta line that wraps, it shall follow the text as part of it. When an error's or an unavailable row's reason takes the meta line's place, the end shall not show. Screen readers shall hear the text and its end as one line.

## Examples

- Given a row in a plain List with the meta line "Support reply · run 891b5a · a person step" and the end " · Waiting 1 h",
  when it renders in a narrow list,
  then the line reads "Support reply · run 891b5a · a pe… · Waiting 1 h": only the text before the end is cut.
- Given the same row with `wrapMeta` in a List that isn't plain,
  when it renders,
  then the text and its end make one line that wraps onto two, then is cut.
- Given the same row with an error,
  when it renders,
  then the error's reason takes the line's place, without the end.
