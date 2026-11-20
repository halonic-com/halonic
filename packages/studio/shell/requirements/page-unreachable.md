# shell.page-unreachable

- Status: active
- Since: unreleased
- Source: HAL-13361 (served Studio walk, HAL-13351); microcopy 10.1; a11y 1.4

When the served Studio or the phone can't load a page's code because the computer can't be reached, the shell shall show, in that page's area only, the error-tone Empty state "Couldn't load this page" with the reason "Halonic couldn't reach the computer to show the _page_.", where _page_ is the page's name, and the one button **Try again**, without **Copy details**, in place of "This page stopped working". Halonic counts a failed load of a page's code as unreachable only when the browser says a module import or a preload failed (`shell.code-load-failure`). **Try again** shall import the page's code again in place, without reloading the window, and, when that works, draw the page and move focus to its own `h1`; when it fails again, the state shall stay and focus shall go to its title. When the state shows as the user opens the page, where the shell would move focus to the page's `h1`, focus shall go to its title instead; focus the user put somewhere else, such as in the sidebar, shall stay. The same holds for a Settings section and a Home card, each naming itself in the reason. In a Settings section, on the desktop dialog and on the phone, the title shall read "Couldn't load these settings", one heading level below the section's name. As it shows there, the shell shall read the title once through the polite region, leaving the focus where it is; after a Try again that fails again, focus on the title reads it and the polite region shall stay quiet. In the desktop app, whose code is on the computer itself, a page whose code fails to load shall still show "This page stopped working" with **Copy details** (`shell.page-stopped`).

## Examples

- Given the served Studio, and the computer can't be reached,
  when the user opens the Inbox for the first time and its code fails to load,
  then the page area says "Couldn't load this page" and "Halonic couldn't reach the computer to show the Inbox.", with Try again and without Copy details.
- Given the Inbox showed "Couldn't load this page" and the computer answers again,
  when the user presses Try again,
  then the Inbox shows, the window wasn't reloaded and focus is on its `h1`.
- Given the Inbox showed "Couldn't load this page" and the computer still can't be reached,
  when the user presses Try again,
  then "Couldn't load this page" still shows and focus is on its title.
- Given the desktop app,
  when the Inbox's code fails to load,
  then the page area says "This page stopped working", with Reload page and Copy details.
- Given the served Studio,
  when the Agents page throws "rows is undefined" while it draws,
  then the page area says "This page stopped working", since that isn't a failed load.
- Given the served Studio, and the computer can't be reached,
  when the user presses Enter on Inbox in the sidebar and its code fails to load,
  then focus is on "Couldn't load this page".
- Given the Settings dialog, and the computer can't be reached,
  when the Appearance section's code fails to load,
  then the section says "Couldn't load these settings" as an `h4` under its `h3` "Appearance", and "Halonic couldn't reach the computer to show the Appearance settings.".
