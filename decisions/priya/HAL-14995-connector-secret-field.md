# Decision: a connector's secrets are set on its page

- Approval: HAL-14995 (Liam's decision, option 1, a team decision building on the approved plugin secret fields); the CTO, Liam, approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2Kiq9J1+0qwZSpoEocp+Opv2yD0k0PyAORhPLRn4/tNx2wclXqtKtR62IR5TjKGNkwBiecA9+JaPSB9juVf3Bw==

The desktop app's connector page gets a Secrets section that writes a
connector's secrets to the keychain its program reads them from
(`library.connector-secrets`, new). With the section on the page, the
"Couldn't list the tools" line for a secret that isn't set or was refused ends
"Set it under Secrets, then try again." in place of the stopgap's "Studio
can't set a connector's secrets yet.", which stays where there is no section
(a browser, `serve`, a phone). `library.listed-tools-waiting` gains that
alternative; nothing else it says changes.

## Covers

- library.listed-tools-waiting
