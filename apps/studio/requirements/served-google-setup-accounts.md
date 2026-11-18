# studio.served-google-setup-accounts

- Status: active
- Since: unreleased
- Source: HAL-10697 (served Studio: Google setup read and sign-in place); UX check HAL-10741; HAL-12369 (UX check L8)

The served Studio shall read the Google setups of its workspace with `GET /api/google/setups` on the page's own address and the page's session, and give them to the Google setup feature as accounts, each with the connector's address and the services of its sheets as the computer lists them. Any answer that isn't that list, or a refusal, shall make the read fail, so the window shows "Couldn't load the Google setup" and never a half-known setup.

The window shall only read. Every change (a step, a client secret, start over, disconnect, sign-in, cancel, check again, a new address) shall be refused with "This window can only read the Google setup. Finish it on the computer running Halonic." and shall send no request. There is no client secret field: the secret entry is unavailable.

`signInEntry` shall be what the computer said about this window on the last read: `here` or `elsewhere`. Any other value counts as no answer, and the read fails. Until a read has answered, it is `elsewhere`, the safe side. `checkAgainEntry` shall always be `sign-in-again` on the `computer`, so **Check again** is unavailable and the page offers `halonic google sign-in` to run on the computer instead.

## Examples

- Given the computer answers a list with one setup and `signIn: "elsewhere"`, then the accounts hold that setup with its address and `signInEntry` is `elsewhere`.
- Given the computer answers 401, then reading the accounts fails.
- Given any change is tried, then it is refused and no request is sent.
