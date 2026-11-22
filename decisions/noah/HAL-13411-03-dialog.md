# Decision: the report holds a sandbox reason only when Halonic knows it, and numbers only when they are numbers

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13411
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Zjq/jsMKRZ38IiGwMUphboLk/UA+n7L+KSXAmVWOnjfEl6/Gx9IF885DYMeOnqN4MHxCYweltEKo+LJMlQFmBQ==

## What changes

Liam's review of #5087 on HAL-13411 (22 Nov) found two facts that `check-computer.report` let into the report as they came: `AgentHostDoctor` checks only a line's `check`, `status` and `actions` and passes the other facts through, so the Sandbox `reason`, the Workspace's number of file problems, the Last run's step and steps, and the Google step could hold any text.

- A sandbox reason code reaches the report only when `isSandboxStartReason` from `@halonicjs/app` knows it; any other reads "can't start · unknown".
- A count or step number reaches the report only when it is a whole number of zero or more; otherwise the row says what it found without the number: "problems in its files", "failed at a step", "setup, started 8 Nov".

The requirement narrows what the report may hold and widens nothing. It gains one example; no example is removed and no test is changed, dropped or skipped. The leak test now also fills these five facts with the key-shaped string, the email address, the step name, the workspace name and the home path.

## Why

The report is an allow-list (first-run-progress 4.3 on HAL-7986, approved by the board on 19 Nov, HAL-7993): a person pastes it into a question, so nothing that could hold a name, a key or an error text may reach it. Liam required both fixes before Copy report is wired up, which this pull request does.

## Covers

- check-computer.report
