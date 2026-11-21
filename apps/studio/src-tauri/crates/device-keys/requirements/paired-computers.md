# studio.src-tauri.crates.device-keys.paired-computers

- Status: draft
- Since: unreleased
- Source: HAL-15157 (D6), design "Removed" (HAL-12206), ADR "Pairing and the end-to-end session"

The phone shall keep, for each computer it has paired with, the computer's name, the endpoints it paired through (the latest first, at most 8), where it stands with the computer (paired, can't confirm or removed), the computer's pinned static key while paired or can't confirm, the time the latest pairing ended and the time it was last connected, in one file per computer in the app's private data next to that computer's sealed key. When the phone pairs, then it shall save the key before the details and, if the details can't be written, forget the key again. When the phone pairs again with a listed computer, chosen by the person (Pair again) or pinning the same key, then the new pairing shall replace that entry under the same id, with the new key pinned, and a second entry pinning the same key shall be forgotten. When the computer answers with another key than the pinned one (Can't confirm), then the phone shall keep the key and the pin. When the computer, after proving who it is, says the phone isn't paired (Removed), then the phone shall delete that computer's key and pin and keep its name and endpoints, listed as removed. When the person forgets a computer, then the phone shall delete that computer's key and then its details, and nothing of any other computer. The phone shall list its computers oldest pairing first; a computer whose details can't be read, because the file was changed or copied from another computer's, shall still be listed, without details, so the person can forget it.

## Examples

- Given the phone has paired with Office,
  when it lists its computers,
  then Office is listed with its name, and its key loads.
- Given the phone has paired with Office and Laptop,
  when the person forgets Office,
  then Office has neither key nor details, and Laptop keeps both.
- Given the phone pairs with Office again,
  when it lists its computers,
  then Office is listed once, with the new name and the new key.
- Given Office said the phone isn't paired,
  when the phone lists its computers,
  then Office is listed as removed with its name, and has no key.
- Given Office is removed and the person chooses Pair again,
  when Office allows the pairing with a new key,
  then Office is listed once, paired, under the same id.
- Given Office's details file copied over another computer's,
  when the phone lists its computers,
  then that computer is listed without details, and forgetting it removes it.
- Given the details can't be written,
  when the phone pairs,
  then the pairing fails and no key is kept.
