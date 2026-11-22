# Decision: a run whose changes are gone says so, with Remove from Inbox and failures by kind

- Task: HAL-16161
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16161 (a team decision with no board card, HAL-2282 rule: wording on the approved Inbox and proposal page; rows 31 and 32 of the designer's words check C681 on HAL-16153, which fit PR (B) of the plan Liam approved on HAL-16083)
- Kind: user-visible

## What changes

- **The line for changes that are gone (C681 31).** When the agent host says a run's changes are
  gone, the page said "This proposal can't be opened any more." with **Remove**. The page is open,
  so "can't be opened" isn't what the person sees; the screens avoid "proposal"; and a bare
  **Remove** under a run's changes can read as deleting files, when nothing on disk changes. It now
  says "Run 01JD8Q's changes were deleted outside Halonic, so they can't be shown or accepted.",
  the sentence the CLI says, with **Remove from Inbox**, and once removed the toast "Removed run
  01JD8Q from the Inbox".
- **A Remove that fails (C681 32).** The line said "Couldn't remove this proposal." followed by the
  host's own text, such as "The proposal of run run_mfx3k2a1_0001JD8Q is still available." or a
  route and a code. Studio now sorts the failure by its type and the host's kind, and the page
  words it from that: `proposal_refused` (the changes are there again) as "Couldn't remove this:
  run 01JD8Q's changes are there again. Review them instead.", with no **Remove from Inbox**,
  since it would be refused again; a host that isn't running as "Couldn't remove this: the engine
  isn't answering. It may still be starting." with **Try again**; anything else as "Couldn't
  remove this: Halonic ran into a problem it can't explain yet." with **Copy details**. The host's
  text reaches the person only through **Copy details**. The test of the old failed Remove, which
  expected the host's text on the line, is replaced by one test per kind in `proposal-gone.test.tsx`.

The changesets of #4994 and #5057 are reworded to match (C681 rows 34 and 26). Row 30 ("accept or
reject" in `inbox.proposal-page`) already landed with #5092.

## Covers

- inbox.proposal-page-states
- studio.workspace-proposal-remove
- packages/studio/features/inbox/src/ui/proposal-card-states.test.tsx
