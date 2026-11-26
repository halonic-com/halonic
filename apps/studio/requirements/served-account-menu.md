# studio.served-account-menu

- Status: active
- Since: unreleased
- Source: HAL-18216 (S2-25 PR 4, plan on HAL-14151); `account-menu.menu`, `account-menu.sign-out`;
  `warnings` from HAL-19052 (S3-11 PR 3, plan on HAL-14163), for `account-menu.usage-banner`

The served Studio shall give the account menu (`account-menu.menu`) through the computer, on the
page's own address and session: `GET /api/account-menu` for the signed-in customer, where a 404
means there is no menu, and `POST /api/sign-out` to sign out; **Sign in again** goes to
`/api/sign-in`. Any other refusal shall reject with the method, the path and the status only. An
answer that isn't exactly `name`, `productName`, `plan`, `usedPercent`, `warnings`, `accountUrl`
and `planUrl`, whose two addresses aren't `https:` without a user or password, or with a warning
that isn't exactly `unit`, `percent` and a `resetsAt` time, shall reject too, so a wrong answer
never becomes a link or a banner.

## Examples

- Given the computer answers 404 to `GET /api/account-menu`, then the menu's facts are `null`.
- Given it answers Sofia Marin on Pro at 62%, then the facts are exactly that answer.
- Given a warning for agent time at 82% without `resetsAt`, then loading rejects.
- Given the answer's `accountUrl` is `http://account.example.com/acme`, then loading rejects.
- Given **Sign out**, then `POST /api/sign-out` is sent; a 500 rejects with "The computer
  answered 500 to POST /api/sign-out."
