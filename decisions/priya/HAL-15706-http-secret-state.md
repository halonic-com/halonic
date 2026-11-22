# Decision: an HTTP connector's secret lines say Studio can't tell if it's set, and name the variable

- Approval: flow check C618, row 2, on HAL-15706, and C617, rows 52 and 53, on HAL-15715 (a team wording call on the approved connector page, HAL-2282), with Liam's review of the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Bou9pjrxF8nbbWENlieLlhsQqTTdLj9qH2M2wLet9RgiFd4b+5BxU/v6i5zgIWdRZjppasRDI5SKm4NNP7LtDw==
- Task: HAL-15706, HAL-15715

## What changes

`library.http-connector-secret` (not yet released) changes its words and adds one line:

1. The desktop app's line says in one sentence which runs use the secret, "so only runs started
   with halonic run or halonic routines watch use <name>.", instead of "so it doesn't use <name>.
   Runs from a terminal do.".
2. Both lines say Studio can't tell whether the secret is set. The secret is in the command line's
   store, which Studio neither writes nor reads, so the page can't show Set or Not set as it does
   for a program's secrets in Studio's own keychain store.
3. After the command box, a line names `HALONIC_SECRET_<NAME>` as the other way, as the command
   line's refusals do ("Save it with halonic secret set X, or set HALONIC_SECRET_X").
4. Elsewhere, the line names the computer as "the computer running halonic serve", as the key
   block does, instead of "the computer it runs on", which in a browser reads as the browser's own
   computer. It starts "Studio can't set <name> here".
5. The "How it connects" section leaves out its Secrets row while these lines show, so each name
   shows once.

No example is removed: each one now says the new words, and the first one also checks that there
is no Secrets row.

## Why

C618 found that the page didn't say whether the secret was set, called the runs that use it
vaguely, named only one of the command line's two ways, and showed the name twice. C617 found
that the desktop app's line made the reader put two sentences together to learn who uses the
secret, and that "the computer it runs on" could mean the browser's computer.

## Covers

- library.http-connector-secret
