# Decision: changes to the guard's trust roots need two different guardians' signatures

- Approval: the board checked and approved this design on HAL-1337 on 12 Nov, replacing the HAL-3434 answer that the user approves on GitHub; Liam signs this pull request as the one guardian the base branch pins
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:q8JY2+4yDzhpCmxrYK6eHuPOfI+17GxMQKv0r1jSCdSPSe//u8+purZg4uTSerwkhK6Go2Q4/IIh4ojjBvKOCQ==

The board decided that no person depends on the user for guard changes ("I don't want to approve these things"). So a change to the guard's trust roots (`tooling/check/approvers.json`, `.gitattributes`, `tooling/check/policy.json` outside `extraExports`, the guard workflow, `tooling/check/src/guard/`, the two guard commands and the `lib/` helpers they import) needs a `user-visible` note with two `- Signature:` lines from two different keys under `guardians` in `approvers.json`: the CTO's and the security reviewer's. The same key twice counts once, and neither signs alone. The list is read from the base branch, so nobody can add themselves, and a guardian can't be removed or added without two signatures under the list as it is. `user-visible` and `internal` notes need the CTO's key alone, and no GitHub review. The reason is agent-only approval with two keys, so that one agent that is wrong or compromised can't change the guard.

**Bootstrap.** The threshold is two, but never more than the number of guardians the base pins, and a file with no `guardians` list has the `internal` keys as its guardians. So this pull request, which adds the rule and touches no trust-root file that the base protects, needs only the CTO's signature, and the next pull request adds the security reviewer's key under that one signature. From then on two are needed, and the threshold can't be lowered because that is a change to the list.

**Process rule, not enforced by code.** A guardian doesn't sign a pull request they wrote; the other guardian does, after Mateo (not a guardian) has checked it on the review task. Both keys live in Paperclip, so a compromise of Paperclip itself would reach both; separate users per agent and key rotation are the follow-up (HAL-7688).

This replaces the review check this pull request first added: the pinned GitHub account, the live review read and `check.guard-user-review` are gone. `pnpm decision sign` now lets a second guardian add a line under the first.

## Covers

- .github/
- tooling/check/
- check.guard-signed-notes
- check.guard-notes-own-paths
- check.guard-two-guardians
