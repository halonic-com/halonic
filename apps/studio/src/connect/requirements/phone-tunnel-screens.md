# studio.connect.phone-tunnel-screens

- Status: draft
- Since: unreleased
- Source: HAL-15985 (flow check C661 on HAL-15978, finding 1; tunnel design on HAL-12206, decision 14; launch rule decided on HAL-16439)

When the shell gives the Android app's own page no phone tunnel, the page shall be the 0.1 connect page, with no `tunnel` screen, and shall not load the phone app. When it gives one, the page shall decide at every launch, without saving the result:

- when the shell opened the page to change the address (`#change-address` or `#page-not-shown`), the page shall show the connect screen as in `studio.connect.remembered-address` and not load the phone app;
- when the phone has no paired computer and an address is remembered, the page shall start as in `studio.connect.remembered-address` and not load the phone app; a paired list that can't be read counts as no paired computer;
- otherwise the page shall load the phone app into a new `tunnel` screen, hide its other screens and not connect to a remembered address.

When the phone app asks for the address, the page shall show the connect screen with the remembered address filled in, and when back comes to the phone app, the page shall show the `tunnel` screen again. The phone app's Open settings shall call the shell's `phone_open_settings` and its Open Tailscale `phone_open_tailscale`; if either opens nothing or is refused, the page shall stay as it is and log it.

## Examples

- Given no tunnel and a remembered address,
  when the page starts,
  then it connects to that address as in 0.1, has no `tunnel` screen and loads no phone app.
- Given a tunnel, no paired computer and no remembered address,
  when the page starts,
  then only the `tunnel` screen shows, with Pair with a computer in it.
- Given a tunnel, no paired computer and a remembered address,
  when the page starts,
  then it connects to that address as in 0.1 and loads no phone app.
- Given a tunnel, a paired computer and a remembered address,
  when the page starts,
  then only the `tunnel` screen shows and nothing connects to the address.
- Given a tunnel, a paired computer and the hash `#change-address`,
  when the page starts,
  then the connect screen shows with the remembered address filled in.
- Given the last paired computer was forgotten and an address is remembered,
  when the page starts again,
  then it connects to that address as in 0.1.
- Given a tunnel and a remembered address,
  when the phone app asks for the address,
  then the connect screen shows with that address filled in.
