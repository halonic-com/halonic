# kit.external-link-requested-address

- Status: active
- Since: 0.1.0
- Source: HAL-700; build plan D7 (HAL-678, revision 4)

Where an `ExternalLink` takes its address from a request (`href: () => Promise<string>`), as "Sign in with Google" and "Open again" do, the kit shall also require an `onError`. When the user clicks it, the kit shall ask for the address and pass it to `openExternal` at once, still pending, without awaiting anything first, and ignore further clicks until it settles. Where the shell provides no `openExternal`, the kit shall open an empty tab inside the click, cut its handle back to Studio, and set the address when it arrives. If the address doesn't arrive or isn't an `http` or `https` address, then the kit shall close that tab and call `onError` with the error.

## Examples

- Given "Sign in with Google" with an address from the start route,
  when the user clicks it,
  then the start route is called once, `openExternal` gets a pending address, and the page opens when it arrives.
- Given the address hasn't arrived yet,
  when the user clicks again,
  then nothing more is requested and the button is `aria-busy`.
- Given no `OpenExternalProvider`,
  when the user clicks,
  then an empty tab opens before the address arrives, and gets the address when it does.
- Given the start route fails,
  when the user clicks,
  then the empty tab is closed and `onError` gets the error.
- Given the start route returns `javascript:alert(1)`,
  when the user clicks,
  then nothing opens and `onError` gets a `TypeError`.
- Given an `ExternalLink` with a function `href` and no `onError`,
  then TypeScript reports an error.
