# studio.connect.pair-scan

- Status: draft
- Since: unreleased
- Source: HAL-12246 (tunnel phase B build plan on HAL-12232, decisions 14 and 16)

When the phone's pairing screens scan a code, the page shall ask the shell's `pair_scan` command and nothing else, and close the camera through `pair_scan_cancel`. When the shell hands on a scanned text, the page shall decode it with `decodePairingQr` and give the computer's key, the pairing code, its name and its addresses. If the text doesn't decode, including a pairing code of an unknown version, then the page shall say it isn't a pairing code. The page shall never open, fetch or look up anything from a scanned text. If the shell's answer isn't one the page knows, then the page shall read it as the scanner closing without a code.

## Examples

- Given the shell scanned a version 1 pairing code,
  when the page reads it,
  then it gets `pairingCode` with the computer's key, code, name and addresses, and the only call made was `pair_scan`.
- Given a pairing code whose version byte is 2,
  when the page reads it,
  then it gets `notAPairingCode`.
- Given the shell answers `{"kind":"noCamera","askAgain":true}`,
  when the page reads it,
  then it gets the same answer.
- Given the shell answers `{"kind":"opened"}`,
  when the page reads it,
  then it gets `closed`.
