# shell.sidebar-view-request

- Status: draft
- Since: unreleased
- Source: HAL-12227 (Library's "Open the docs folder"); plan approved on HAL-12255

Where the window is on the desktop, it shall give every feature's context a `showSidebarView(viewId)` that shows a sidebar view (`shell.sidebar-switch`) as picking its tab does: `studio` shows the places again, and another id shows the view a feature added with that id. An id no feature added shall change nothing and show no error. The window shall keep the picked tab in memory only, not across a restart. On a phone, which has no sidebar views, the context shall have no `showSidebarView`, so a feature can tell it isn't there.

## Examples

- Given the feature `files` adds the view "Files" and the sidebar shows the places,
  when a feature calls `showSidebarView("files")`,
  then the switch has "Files" selected and the Files view is drawn.
- Given the Files view is shown, when a feature calls `showSidebarView("studio")`,
  then the places are shown again.
- Given no feature adds a view `notes`, when a feature calls `showSidebarView("notes")`,
  then the sidebar stays as it was.
- Given a window narrower than 600px,
  then a feature's context has no `showSidebarView`.
