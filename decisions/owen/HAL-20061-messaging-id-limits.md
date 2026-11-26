# Decision: the Limits sentence names the messaging id rule

- Approval: follow-up from the review of #6343 (HAL-19061); the rule itself landed in #6320; task HAL-20061. Liam approves this note in review
- Kind: user-visible

The requirement `ports.remote-gateway-protocol` still said every id is 1 to 128 characters from `A`–`Z`, `a`–`z`, `0`–`9`, `_` and `-`. Since #6320, messaging ids (an Inbox item, a conversation, an addressee or a pull request) are made by the providers and follow `gatewayMessagingIdPattern`: 1 to 256 characters that `encodeURIComponent` leaves as they are, plus `%` and `:`. The Limits sentence now says so. The code and tests already follow this rule; only the wording catches up. Phone and host ids keep the strict rule.

## Covers

- ports.remote-gateway-protocol
