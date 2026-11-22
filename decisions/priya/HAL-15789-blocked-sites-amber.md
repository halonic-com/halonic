# Decision: the run page's "Blocked 3 sites" line is amber, like the without-the-sandbox shield

- Approval: HAL-15539, comment 347696b5-3b53-46a1-8fde-623fda666cc2 (Liam leaves the tone to the author); C630 finding (HAL-15782, comment a5e52d13-1826-4829-a8a6-465351009cf4); task HAL-15789; Liam approves this note by signing it in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:j5UvVCr4XmviJSKEOeza4oDN6t8J8Tj3OvbzU6WMxNO/Y+8TYHgcMyykoGfwuOhvhgBJv+rdcCPY1F7IR9C+Dw==

## What changes

`runs.run-view.blocked-sites`: the "Blocked 3 sites" line under a step, a row in the run's
timeline, now has its warning icon in the attention tone (amber), where it said "in warning tone".
The words, the icon, the entry's Blocked sites panel and everything else in the requirement stay as
they were.

## Why

The sandbox stopped a site; nothing waits on the person, so it asks them to have a look. The kit
keeps the warning tone (violet) for "Needs you, your turn" and the attention tone (amber) for "have
a look". The run page's without-the-sandbox shield (HAL-15659) and the Blocked line in the step's
entry already use amber, so the timeline's line now matches them.

## Covers

- runs.run-view.blocked-sites
