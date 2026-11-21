# studio.src-tauri.crates.device-keys.paired-computers

- Status: draft
- Since: unreleased
- Source: HAL-15157 (D6), design "Removed" (HAL-12206), ADR "Pairing and the end-to-end session"

The phone shall keep, for each computer it is paired with, the computer's name, the endpoint it paired through, the computer's pinned static key and the time the pairing ended, in one file per computer in the app's private data next to that computer's sealed key, named by the computer's key in lowercase hex. When the phone pairs with a computer, then it shall save the key before the details and, if the details can't be written, forget the key again, so details are never kept without their key; pairing with the same computer again shall replace the earlier pairing. When the person forgets a computer, or the computer says after proving who it is that the phone isn't paired (Removed), then the phone shall delete that computer's key and then its details, and nothing of any other computer. The phone shall list its paired computers oldest pairing first; a computer whose details can't be read, because the file was changed or copied from another computer's, shall still be listed, without details, so the person can forget it.

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
- Given Office's details file copied over another computer's,
  when the phone lists its computers,
  then that computer is listed without details, and forgetting it removes it.
- Given the details can't be written,
  when the phone pairs,
  then the pairing fails and no key is kept.
