# studio.connect.tunnel-stays-home

- Status: active
- Since: unreleased
- Source: HAL-15159 (D7 design, B7 items 3 and 5); HAL-15178

When the phone app opens a paired computer, at launch or with Open agents after pairing, the Android app's own page shall stay on the app's origin and reach the computer only through the shell's `phone_*` commands. When the tunnel can't reach the computer, because the shell refuses to connect, the computer isn't answering or the first reach gives up, the page shall show the tunnel's state and shall not open the computer's LAN page, connect to the remembered address or show the connect screen. The connect screen shows only after "Not listed? Enter its address" in Pair with a computer, as in `studio.connect.phone-tunnel-screens`.

## Examples

- Given a paired computer and a remembered address,
  when the page starts and the computer connects,
  then the page is still on its own address and asked the shell only `phone_*` commands.
- Given nothing paired,
  when the phone pairs with a computer and Open agents is pressed,
  then that computer's screen opens on the page's own address.
- Given a paired computer that isn't answering and a remembered address,
  when Try again is pressed,
  then the page says the computer isn't answering and connects through the tunnel again, not to the address.
- Given a paired computer and a shell that refuses to connect,
  when the page starts,
  then it logs the refusal and stays on the tunnel screen.
- Given a paired computer that doesn't answer for 30 seconds,
  when the first reach gives up,
  then the page says the computer isn't answering and stays on the tunnel screen.
