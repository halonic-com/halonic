# cloudflare-durable.usage-rate

- Status: active
- Since: unreleased
- Source: HAL-18015 (part of HAL-13219); selling layer design, section 4.3

The usage object shall count each check, reservation and run start of a scope in a window of one minute, and refuse one past 600 in the window with `usage.rate`, and in an organisation's scope one past 120 of the same actor with `usage.member.rate`; both refusals carry the limit and the time the window ends. A refused call shall not be counted. The count shall be taken before the object asks Cloud for limits, and a running run's heartbeat shall not be counted or refused. The limits shall stay far below the deployment's daily request ceiling, so one customer can't spend it for the others.

Rationale: the daily ceiling is the deployment's; without a limit per customer, one scope's loop could use it up and stop every other customer's runs for the rest of the day. Inside an organisation, one member's loop must not stop the other members. A heartbeat refused would stop a run the limit already let start.

## Examples

- Given a scope's 600th call in a minute,
  when the next check arrives in the same minute,
  then it is refused with `usage.rate`, and the first call of the next minute is allowed.
- Given an organisation member who made 120 calls in a minute,
  when they check again,
  then they are refused with `usage.member.rate`, and another member is allowed.
- Given a scope at its limit for the minute,
  when a running run renews its lease,
  then the renewal is allowed and Cloud is not asked for limits.
