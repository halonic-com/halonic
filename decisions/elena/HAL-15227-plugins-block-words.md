# Decision: Plugins and integrations, three word fixes from C553

- Approval: words check C553 rows 18, 22 and 23 (HAL-15219), small fixes on the approved R16 block decided by the team (HAL-2282) on HAL-15227; Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2atqVOh8xMEboJZLL0begtd9Ct2wNGLW7GDCBCj0tl1YlKa7oVxeBe8sLN3TzR93olPe4XB8f4yexObJ7vxiCQ==
- Task: HAL-15227 (under HAL-1733)

## What changes

`settings.unfenced-yes-take-back` changes in three places:

1. For the reason `windows`, the saved yes reads only "Allowed on *day*.". The block's own line already says why, and the old reason ("On Windows, plugin code can't run in the sandbox in this version of Halonic.") said it twice and named only plugin code. Every other reason still reads "*Reason* Allowed on *day*.".
2. A failed **Take back** words its reason with the shell's `errorReasonFor`, so an internal error reads "Halonic ran into a problem it can't explain yet." and never its raw message, and the toast offers **Try again**.
3. When the host can't say whether a yes is saved, the block shows its heading, "Couldn't check whether plugins may run without the sandbox." and **Try again** instead of hiding. Hiding looked as if nothing was allowed, which is when someone most wants **Take back**. The new line claims no yes and no no.

Nothing was weakened: the test for a status that can't be read now checks the new line and Try again instead of an empty block, and the Take back failure test now also checks Try again.

## Covers

- settings.unfenced-yes-take-back
