# ports.agent-messaging-web-link

- Status: active
- Since: unreleased
- Source: board report on HAL-10 via HAL-19362 ("I should be able to open the link to it"); plan approved by Liam on HAL-19367

The `AgentMessaging` port shall let a source give an inbox item a `webLink`: the item's own page in the source, with `site`, the source's name for that place, such as "Paperclip". Apps show it as "Open in _site_" and only open it. An item shall hold together only when its `webLink` link is an `https:` address, checked as an `answerElsewhere` link is, and its `site` is not blank and at most 80 characters long. A `webLink` shall not change which answers an item takes.

## Examples

- Given an item whose `webLink` is `https://acme.example/ACME/issues/ACME-7` with the site "Paperclip",
  when it is checked,
  then it holds together, and a reply still fits it.
- Given an item whose `webLink` link is `http:`, `javascript:`, a bare path or holds a user name,
  when it is checked,
  then it doesn't hold together.
- Given an item whose `webLink` site is blank or 81 characters long,
  when it is checked,
  then it doesn't hold together.
