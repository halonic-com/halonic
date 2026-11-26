# inbox.window-item

- Status: active
- Since: unreleased
- Source: HAL-19734 (part D of HAL-19534's plan, approved on HAL-19566); the window's content in `studio.window-content`

The Inbox shall tell its watchers which item its page shows, by key, each time that changes. When its window reopens on a kept item, the Inbox shall wait for its list to load and open that item as `requestOpen` does, only while it is in the list. An item that is gone, or a list that fails to load, shall leave the list showing, with no item open.

## Examples

- Given the Inbox's window showed Acme's approval at the last quit, still waiting,
  when Halonic starts again,
  then the Inbox's window opens on that approval.
- Given the Inbox's window showed an approval answered since,
  when Halonic starts again,
  then the Inbox's window shows the list, with no item open.
