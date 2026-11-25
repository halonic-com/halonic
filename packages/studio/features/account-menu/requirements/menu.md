# account-menu.menu

- Status: active
- Since: unreleased
- Source: HAL-18216 (S2-25 PR 4, plan on HAL-14151); flows B7; screen map 3.1 and 4.1

Where the app provides the account menu host, the Account Menu feature shall ask it for the
signed-in customer's facts (`GET /api/account-menu` in a served Studio). When it answers, the
feature shall show the customer's initials at the title bar's right end, named "Account menu,
{name}", opening a menu with:

- the customer's name, as a heading;
- the plan and usage line, "{Plan} · {percent}% of this month's usage", only "{Plan}" with no cost
  limit and "No plan" with no plan, with the `warning` dot from 80%; picking it opens the answer's
  `planUrl`;
- **Account**, which opens the answer's `accountUrl`;
- **Sign out** (`account-menu.sign-out`).

The name and the product's name shall show as text only, and the feature shall never build an
address from them: it opens only the addresses in the answer. When the host says there is no menu
(a 404: a single-user Studio, or many users without Cloud sign-in), when it can't answer, or where
no host is provided, as in the desktop app, the feature shall show nothing.

## Examples

- Given `/api/account-menu` answers 404,
  when the served Studio opens,
  then the title bar has no account menu.
- Given it answers Sofia Marin on Pro at 62%, with `https://account.example.com/acme` and its
  `#plan`,
  when Sofia opens the menu and picks "Pro · 62% of this month's usage",
  then `https://account.example.com/acme#plan` opens; **Account** opens
  `https://account.example.com/acme`.
- Given she has used 85%,
  when the menu opens,
  then the usage line has the `warning` dot and reads "nearly used up" after it.
