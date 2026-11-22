# Decision: the unread-routine-input hint leaves out the fields the routine already gives

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15711 (team wording call on C615, HAL-15698; small wording on an approved check, HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xQT9VSn3kR7LrTwSft47Mchyqji2D3TGy3ZfQR70OxkdT4xNVuWh0/eLYjx8ohooOY2cdKkOb85062fRag4DDQ==

## What changes

`workspace.routine-input`'s hint ("Did you mean input.<field>?", or else the fields the steps read)
now leaves out every field the routine's `run.input` already has. When no field is left, it says
"The routine already gives every field its steps read: remove the key." When some read fields are
given and others aren't, the list says "Its steps also read ...".

## Why

C615 (HAL-15698) on #4573: with `input: { mail: hi, region: north }` for `support-reply`, the
warning said "Its steps read input.mail: rename the key to that, or remove it." Renaming `region`
to `mail` gives `mail` twice, so only half the hint could be followed. The same held for "Did you
mean input.day?" when `day` was already a key. The wording keeps the approved C336 form, what is
wrong and then what to do.

## Tests

No test was weakened or skipped. `routines.test.ts` adds a case for a near match that is already
given, a list with some fields given, and all fields given. A real `halonic validate` on a copy of
Acme gives the new line for C615's routine.

## Covers

- workspace.routine-input
