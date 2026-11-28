# shell.rail-current

- Status: active
- Since: unreleased
- Source: HAL-20944; the accessibility check of the rail in the window (#6906)

The Studio window shall name no two `nav` landmarks alike, so the rail's "Apps" and the sidebar's "Places" can be told apart. The rail shall mark the selected entry `aria-current="page"` while it holds the active tab's page, and `aria-current="true"` while it was picked and opened no page; no other entry shall carry `aria-current`.

## Examples

- Given the window shows the rail and the sidebar,
  when a screen reader lists the landmarks,
  then there is one navigation named "Apps" and one named "Places".
- Given Messenger has no page yet,
  when the person clicks Messenger while the active tab shows Home,
  then Messenger is `aria-current="true"` and no entry is `aria-current="page"`.
