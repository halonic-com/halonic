# Decision: a plugin that is off here links the sandbox guide, as doctor does

- Task: HAL-15716, from words check C617 rows 20 and 22 (HAL-15700)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15716 (wording fixes on approved screens and command output, so a team decision under the HAL-2282 rule; Liam's code review signs this note)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4MR98NoT5BsdTm7dbc/mokhcNtL8wXCLKUw0v3b+5w9mTon1HtVu9Tl8KPm/sVtXOc70tHU6FOnpZExs1bZZCQ==

## What changes

- `cli.commands.plugin.off-here` (edited): under the reason-and-fix line, `halonic plugin add`, `halonic trust --plugin` and `halonic plugin list` now print `halonic doctor`'s dimmed docs line, "More: https://docs.halonic.dev/security/sandbox/#container (container)", with the sandbox guide's section for the reason (`errorMessages.more(sandboxDocsLink(reason), reason)`), then the place line as before. Two indented lines become three. The examples name the new line; the tests that checked the two lines check all three, and none is weakened.

## Why

Two of the fixes point to a page: "The guide has the exact commands." for `user-namespaces-restricted`, and "See what the sandbox needs on this computer." for `other`. Without the link they lead nowhere. C566 #22 (#4625) dropped "Then run halonic doctor again." and didn't add the link that `doctor` and `run`'s plugin part warning already print.

## Decided by the team

- Every reason gets the line, not just the two whose fix names the guide, so the lines under a plugin that is off here have one shape, as `doctor`'s Sandbox line does.

## Covers

- cli.commands.plugin.off-here
