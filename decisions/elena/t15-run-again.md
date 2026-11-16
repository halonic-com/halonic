# Decision: Run again is on the run page, and the failed banners lose the "no Run again" limit

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11049 (Liam moved Run again into T15; the banner's button is part of the approved fifth local-model case in HAL-1308)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jT8CANTOEBwoaTa8GM43HjRoz2YdExbtAKaKT803X5DF86TM7QIH83LANno6F2piYptG5Xp+KvBUTPDaUHrgBw==

The run page gets **Run again** (new requirement `runs.run-view.run-again`): a new run of the same workflow
with the logged input, opened once it has started. It is in the header and on a failed banner that has no
button of its own. The two failed-banner requirements each said "no Run again yet" as a limit; that
sentence now points to the new requirement. Nothing else in them changes, and no test was weakened.

## Covers

- runs.run-view.failure-banners
- runs.run-view.harness-banner
