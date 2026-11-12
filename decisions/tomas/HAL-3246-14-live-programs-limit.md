# Decision: write down that a live run's programs read the saved files

- Approval: Julian's security answer on HAL-4966 accepted the limit for
  v0.1 and asked for this text and test; Liam approves this note in his review of this pull
  request on HAL-3246
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WPbYosyWv5OfuJA6ksjVJKFuEmX31F9C5F86MQIsJXSOBnOuhCWSGMGJKslqRwI34wcTZelgmWcMQR9Q4imVDg==
- Task: HAL-3246

## What changes

`app.runs-read-latest-version` gains one paragraph and one example. They say what the code
already does since halonic#1612: a run that reads the live version still starts its programs
(an unpinned stdio connector's script, a harness agent's working folder) in the workspace
folder, so those programs read the saved files, including changes that aren't live yet. The
paragraph names the case Julian asked for: a script a builder chat or an agent wrote can run in
a live run, such as a scheduled routine, before anyone has made it live. It links the follow-up,
HAL-4975, which runs these programs from a copy at the live commit.

A test records today's behaviour: a connector whose script is live as one answer and saved as
another answers with the saved one in a run loaded as `halonic run` loads it. It flips when
HAL-4975 lands.

## Why

Julian accepted the gap for v0.1 on three grounds: trust and the sandbox are checked on the live
version, so a saved change can't add a program or widen it; every run read the saved files
before #1612, so nothing is worse; and blocking steps while files differ would push people to
make changes live just to get routines running. His conditions were that the requirement says
so plainly, names the agent-written case, links the follow-up, and that a test pins it down.

## What doesn't change

No code changes. The rule for which files a run reads, and every existing example, stay as they
are. No test is weakened: one is added.

## Covers

- app.runs-read-latest-version
