# account-menu.usage-banner

- Status: active
- Since: unreleased
- Source: HAL-19052 (S3-11 PR 3, plan approved by Liam on HAL-14163); flow C3's 80% row (`limit.warning`); board 10's first row (HAL-13521, round 5); unit names from the flows' Units table (HAL-12484)

Where the app provides the account menu host and the signed-in customer's facts list `warnings`
(`server.account-menu-warnings`), the Account Menu feature shall show one quiet banner under the
top bar for the highest unit at 80% or more of its limit and under 100%: the bars icon, "**You've
used {percent}% of this month's {unit}** · It resets on {day mon year}.", **See usage**, which opens the
answer's `planUrl`, and a close button named "Close". The percent shall be the warning's own
`percent`, so a customer at 95% reads 95%, never the 80% mark. The day shall be the warning's `resetsAt`
in UTC, in the short style the connection row uses, such as "2 Dec 2026" (decided by the team on HAL-20021). The units shall read "runs", "steps", "tokens", "agent time"
(`harnessMs`) and, for the cost unit, "usage": a percentage only, never an amount of money. A unit
without one of these names shall get no banner.

Closing the banner shall be remembered on this device by the unit and its `resetsAt`, so it shows
once per unit and period: the next highest unit's banner may show, and the same unit's shows again
in its next period. Focus shall move to the shown page's heading. Without a host, while the facts
load, when the host can't answer or has no menu, and once the customer signed out, the feature
shall show no banner.

## Examples

- Given agent time at 82%, resetting at `2026-12-02T00:00:00Z`,
  when the served Studio opens,
  then the banner reads "You've used 82% of this month's agent time · It resets on 2 Dec 2026."
- Given the customer closed that banner,
  when the served Studio opens again in the same period,
  then there is no banner; in the next period there is one again.
- Given the cost unit at 85%,
  then the banner reads "You've used 85% of this month's usage" and names no money.
