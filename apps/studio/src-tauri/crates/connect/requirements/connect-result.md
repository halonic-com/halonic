# studio.src-tauri.crates.connect.connect-result

- Status: draft
- Since: 0.1.0
- Source: HAL-1375 (flow-install-update 5.3 and 5.4)

When a Connect press ends, the shell shall return one result for the connect page, shaped like the page's `ConnectResult`: connected with the Studio's address, one of the four field errors with the address as shown back where the words need it, or one of the two version screens with the computer's version. If the hello answer is longer than 16 KiB, then the shell shall stop reading it and report "not Halonic".

## Examples

- Given a hello answer from `192.168.1.20:4280` whose versions fit,
  when the result is returned,
  then it is `{"kind":"connected","url":"http://192.168.1.20:4280/"}`.
- Given a hello answer of version `0.3.1` that needs a newer app,
  when the result is returned,
  then it is `{"kind":"appTooOld","computerVersion":"0.3.1"}`.
- Given a hello answer longer than 16 KiB,
  when it is read,
  then the result is "not Halonic".
