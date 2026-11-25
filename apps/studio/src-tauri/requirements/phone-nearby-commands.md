# studio.src-tauri.phone-nearby-commands

- Status: draft
- Since: unreleased
- Source: HAL-16824 rules 1 to 4 (Liam); the D4 discovery answer on HAL-12247

Where the shell runs on Android, it shall let the app's own page list the Halonic computers on this Wi-Fi through `phone_nearby_browse` and `phone_nearby_stop`, from a local capability for the `main` window only, and no page shall call the Kotlin plugin that browses. Before it browses, the shell shall ask Android's "Nearby devices" question and answer `no-local-network` when it is turned down. It shall browse `_halonic-pair._tcp` with Android's `NsdManager` only while the picker is open, resolving hits one at a time below Android 14, and send the page the whole list on its channel, first an empty one and then on every change. It shall stop browsing when the page calls `phone_nearby_stop`, when the navigation guard lets the window leave the app's own page, when a page starts loading and while the app is in the background, where the list empties until the app comes back. It shall send the list only while the window is on the app's own page, refuse a browse from any other page, and ignore a hit from a browse that has ended. After `phone_nearby_stop`, the computers listed shall stay available for pairing by id until the next browse or until the page leaves.

## Examples

- Given the window on the app's own page,
  when the page browses and a computer resolves,
  then the page gets `{ "kind": "computers", "computers": [] }` and then the list with that computer's name and id only.
- Given the window on `http://192.168.1.20:4280/`,
  when a page calls `phone_nearby_browse` or `phone_nearby_stop`,
  then the call is refused.
- Given a browse in progress,
  when the app goes to the background,
  then the search stops and the page gets an empty list; back in the foreground, the search starts again.
- Given a picker that closed,
  when a hit of its browse arrives late,
  then nothing changes and nothing is sent, and the computers found stay available for pairing.
- Given a browse whose search is still starting,
  when the page calls `phone_nearby_stop` or starts loading,
  then the shell stops Android's search again once it has started, and the browse answers `unavailable`.
- Given the guard letting the window go to the confirmed address,
  when a computer resolves,
  then nothing is sent and the list's ids name nothing.
- Given Android before 14 and three hits,
  when they are found,
  then the plugin resolves them one after another.
