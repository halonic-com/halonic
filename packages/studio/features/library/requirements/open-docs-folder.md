# library.open-docs-folder

- Status: draft
- Since: unreleased
- Source: HAL-12227 (Iris's walk of the Acme sample, HAL-12225); plan approved on HAL-12255; folder from HAL-12261

On the desktop, when the window offers `showSidebarView`, the Library place shall give the empty Knowledge tab its "Open the docs folder" button (`library.library-page`). Pressing it shall ask the Files tree to reveal the workspace's `docs` folder (`files.tree.reveal-request`) and show the Files sidebar view (`shell.sidebar-view-request`). When there is no `docs` folder, the tree shows the deepest folder above it; the button shall create and write nothing. On a phone, or where the window offers no `showSidebarView`, the tab shall show its sentence without the button.

## Examples

- Given the desktop and an empty Knowledge tab,
  when "Open the docs folder" is pressed,
  then the Files view shows and the tree is asked to reveal `docs`.
- Given a phone and an empty Knowledge tab,
  then no "Open the docs folder" button shows.
- Given the desktop and a window that offers no `showSidebarView`,
  then no "Open the docs folder" button shows.
