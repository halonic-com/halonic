# @halonicjs/adapter-password-scrypt

The `PasswordHasher` port for `serve`: scrypt from `@noble/hashes` (independently audited, no
dependencies), written as
[`ports.password-hash-format`](../../core/ports/requirements/password-hash-format.md). Cloud targets
use the chained PBKDF2 format in `adapters/password-pbkdf2` instead.

- **Layer:** adapters
- **Owner:** elena
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-password-scrypt`

## Use

```ts
import { createScryptHasher } from "@halonicjs/adapter-password-scrypt";

const hasher = createScryptHasher();
const stored = await hasher.hash("a long made-up password");
// $scrypt$ln=14,r=8,p=5$<16-byte salt>$<32-byte key>
await hasher.verify("a long made-up password", stored); // true
```

- `verify` refuses, with a `RangeError` and before any scrypt work, a hash in another format, a
  malformed one, and settings outside ln 14 to 15, r 8 and p 5 to 16. It compares in constant time.
- `needsRehash` is `true` for any settings but ln=14, r=8, p=5.
- The password is normalised to NFC before hashing, so one typed password has one hash.
