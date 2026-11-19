# Decision: changing the sign-in password ends every sign-in

- Approval: HAL-13350, from the gap list on HAL-13348 (J5)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Z3GPbDndnIarYBaLwQMAiK7K1C6itmCO7Lemc8CJDxSNwECwLZmkmCb7G2Tk+qWTtSPMRLvaQoTviGiWtvMhDw==

## What changes

- `server.sign-in`: a session is stored with a short fingerprint of the `serve-password` hash it
  was started under (the first 16 hex characters of its SHA-256), next to its end time. A request
  whose session has another fingerprint than the current hash counts as signed out, and the
  session is deleted, as an ended one already is. Setting the same password again counts as a
  change, because every hash gets a new salt. A session stored in the old form, a plain end date,
  counts as ended, so everyone signs in once after the update.

## Why

Before this, a session kept working for up to 30 days after the password was changed, so
changing a leaked password did not lock out whoever had signed in with it. Every old example of
the requirement still holds, and no test was weakened.

## Covers

- server.sign-in
