# Decision: each of Home's failure reasons ends in a full stop

- Approval: the maintainer approves this change in review of HAL-5243 (Sofia's UX check, HAL-5238)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:lp/qPQ8nWtWJSYBXIBO/iC8QGR6UkY+/0Tt49ZKIVlmuWoTnFdMitstCTeokxj3fR+0uI0Tk5yl90yScCGEQBQ==

The requirement gains a promise; nothing is narrowed and no test was weakened.

Home's one status says each reason its sections failed for, joined with a space. The Studio's
own reasons end in a full stop, but a kinded error's own message comes from the engine and may
not, and a screen reader then runs two reasons together. The status now adds a full stop to a
reason that doesn't end in one. The text shown in the section itself doesn't change.

One example is added.

## Covers

- shell.home-states
