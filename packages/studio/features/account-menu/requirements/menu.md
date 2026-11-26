# account-menu.menu

- Status: active
- Since: unreleased
- Source: HAL-18216 (S2-25 PR 4, plan on HAL-14151); look and words on HAL-18213; flows B7; screen map 3.1 and 4.1

Where the app provides the account menu host, the Account Menu feature shall ask it for the
signed-in customer's facts (`GET /api/account-menu` in a served Studio). When it answers, the
feature shall show the customer's initials on the 28px avatar tile, as the last item at the
right end of the top bar, a round button named "Account menu, {name}", opening a menu, lined up with its right edge, with:

- the description "Signed in as {name}";
- the plan item: its label "{Plan}" and the detail "{percent}% of this month's usage", with the
  percent capped at 100; only "{Plan}" with no cost limit, and "No plan" with no plan; from 80% the
  `warning` dot with "nearly used up", and at 100% the same dot with "used up"; picking it opens
  the answer's `planUrl`;
- **Account**, which opens the answer's `accountUrl`;
- a divider, then **Sign out** (`account-menu.sign-out`).

The name and the product's name shall show as text only, and the feature shall never build an
address from them: it opens only the addresses in the answer. While it waits for the answer, when
the host says there is no menu (a 404: a single-user Studio, or many users without Cloud sign-in),
when it can't answer, or where no host is provided, as in the desktop app, the feature shall show
nothing.

## Examples

- Given `/api/account-menu` answers 404,
  when the served Studio opens,
  then the title bar has no account menu.
- Given it answers Sofia Marin on Pro at 62%, with `https://account.example.com/acme` and its
  `#plan`,
  when Sofia opens the menu and picks "Pro",
  then `https://account.example.com/acme#plan` opens; **Account** opens
  `https://account.example.com/acme`.
- Given she has used 85%,
  when the menu opens,
  then the plan item has the `warning` dot and is named "Pro, 85% of this month's usage, nearly
  used up".
- Given she has used 120% under a limit that lets runs go on,
  when the menu opens,
  then the plan item reads "100% of this month's usage" and is named with "used up".
