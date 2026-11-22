# studio.connect.phone-tunnel-screens

- Status: draft
- Since: unreleased
- Source: HAL-15985 (flow check C661 on HAL-15978, finding 1; tunnel design on HAL-12206, decision 14)

When the shell gives the Android app's own page no phone tunnel, the page shall be the 0.1 connect page, with no `tunnel` screen, and shall not load the phone app. When it gives one, the page shall load the phone app into a new `tunnel` screen, hide its other screens and not connect to a remembered address. When the phone app asks for the address, the page shall show the connect screen with the remembered address filled in, and when back comes to the phone app, the page shall show the `tunnel` screen again.

## Examples

- Given no tunnel and a remembered address,
  when the page starts,
  then it connects to that address as in 0.1, has no `tunnel` screen and loads no phone app.
- Given a tunnel,
  when the page starts,
  then only the `tunnel` screen shows, with the phone app in it.
- Given a tunnel and a remembered address,
  when the phone app asks for the address,
  then the connect screen shows with that address filled in.
