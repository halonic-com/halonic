# Decision: the Inbox secret hold points at no field that isn't there

- Approval: the wording is Sofia's microcopy revisions 97 to 99 (board-approved T7, T8, T13) and her answers on HAL-9383; Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-9383

## What changes

`inbox.secret-hold`: until the Google setup's step 6 has a body (HAL-713) the Google line is "This looks like a Google client secret. Messages are kept in the run log."; the full line comes back with step 6. On a phone the pointers end "on your computer instead". Microcopy 10.2.

## Why

A line must not point at a field that isn't there (Sofia, HAL-9383 B30). The Google setup can't be done on a phone, so the phone line says where the field is.

## Covers

- inbox.secret-hold
