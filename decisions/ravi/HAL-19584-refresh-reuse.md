# Decision: one Inbox list reads each task's files once, so two key tests check one request less

- Approval: Liam's review of #6511 on HAL-19584 (26 Nov); the task is HAL-19584, and its reviewer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oTz22GTkQ6QLgctwt9l9xKll6IeC27ZxAelklEc/E4RHawJ/nbHjxuHzimMWNLBL9kNuDVhhYyprHTrhVodfDw==
- Task: HAL-19584

## What changes

- One Inbox list now reads a task's files at most once (`PaperclipCardFiles.oncePerList()`),
  even when the task has both a pending approval and a card. Before, it read them once for each.
- No test, requirement or golden file changes. Two tests check every request the client sends,
  one `expect` per request (`stepper-requests.test.ts`) or per header of each request
  (`security.test.ts`). With one request fewer, they make one `expect` call fewer:
  `paperclip-client.stepper-requests` 71 instead of 72, `agent-host.paperclip-key` 210 instead
  of 211. Every request still sent is still checked the same way.

## Why

The task asks that one `refresh` plus the six list reads send each Paperclip request once.
#6483 (HAL-19494) made one Inbox list read a task's files twice, so the poll test in
`src/refresh-reads.test.ts` saw that request twice. Reading the files once is the fix the task
asks for; the lower count comes only from the request that is no longer sent.

## Covers

- paperclip-client.stepper-requests
- agent-host.paperclip-key
