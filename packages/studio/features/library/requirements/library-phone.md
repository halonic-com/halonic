# library.library-phone

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (P9c); flow-library 8

On a phone the Library shall not offer New connector, on the Connectors tab or from a run banner's request: connectors are looked at there, and set up on a larger screen.

## Examples

- Given a phone and a host that can make connectors,
  when the Connectors tab shows,
  then there is no New connector button.
- Given a desktop,
  when the Connectors tab shows,
  then New connector shows.
