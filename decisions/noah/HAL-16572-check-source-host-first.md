# Decision: Check this computer gives each line as soon as its own part answers, and says when the agent host didn't answer

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16572
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SO8jn3+dVpbfuy+xJ8lg3hYK4hIp+/3ISwZ+ABdKDrmvk6XU1mFTZdt6K9io3FNLEQ0U8drBlfJvE2H+tzqsCw==

## What changes

Code check C724 (HAL-16565, item 4) found two gaps in `studio.check-computer.source` (merged with #5294):

- **A slow part held back lines that don't need it.** The Google setups were awaited before the agent host's report, so a Google read that hangs kept the Workspace, Sandbox, Harnesses, Network and Disk lines from ever showing, against the requirement's own "each line as soon as what it needs has answered". Nothing limited the host's doctor either. Now every group of lines is given as soon as its own parts have answered, whichever comes first, and every part has a time limit: 5 seconds for Studio's own parts (as `halonic doctor` gives one check) and 10 seconds for the agent host, whose checks each have 5 seconds of their own. A part that runs over gives no line and says so on the console, like a part that fails, so the dialog stops checking instead of spinning for ever. A key the key store doesn't answer for in time is "unreadable", as one it fails on already was.
- **A host that failed left no trace in the dialog.** The host's lines were left out and only the console said why, so the dialog looked complete with four lines missing. Now a host that fails or doesn't answer in time gives the Workspace, Sandbox, Harnesses and Disk lines as the warning `halonic doctor` gives a check that ran over its limit ("didn't answer in 5 seconds"), with the same mark, words and report rows, so no new words are added. Network has no such line in the doctor and stays out. In the demo, Sandbox and Harnesses still read as Not checked, and Disk shows because it isn't fine.

The requirement's last sentence ("A part that fails shall give no line, and say so on the console") is replaced by the time limits and the host's didn't-answer lines; nothing else in it changes. Its example "Given an agent host that fails, then the host's lines are left out" now says the host's lines say they didn't answer, and it gains two examples, for Google setups that are still being read and for a host that doesn't answer.

Tests: the test for a host that fails now expects the didn't-answer lines instead of no host lines. Three tests that compared the lines in the order the source gave them now compare which lines came, in any order, because the order the lines answer in is no longer fixed; the dialog puts them in its own order (`lineOrder` in `use-check.ts`), so what a person sees is unchanged. The abort test now expects one line before the abort instead of the Engine line in particular. Two tests are added, with fake timers, for a Google read and a host that hang. No test is dropped or skipped.

## Why

The requirement already promised each line as soon as what it needs has answered; the code didn't keep it. A missing line reads as "nothing to see", so the dialog has to say the host didn't answer. The doctor's own "didn't answer" line is the wording the approved screen (first-run-progress 4.2 on HAL-7986, approved by the board on 19 Nov, HAL-7993) already uses for a check that ran over, decided by the designer under HAL-2282.

## Covers

- studio.check-computer.source
