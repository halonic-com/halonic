# Decision: a wait card turns stale when its run is answered elsewhere, and its tooltip shows only for a cut-off label

- Approval: HAL-12721 (L2 and L15, from the first-run check in HAL-12714); the stale card's words and **Open run** are flow-inbox 5.4 and INBOX-CARD-31 as approved. Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xUQqRIPPRDmN3dO3+s5r7HFpr9TYCDjPUTu/Fe7FDj2333oFf6xyRetWd563rdxTpFGlxrW1wUFDgtQns6ZsBA==
- Task: HAL-12726

## What changes

`inbox.wait-card` gains the stale state the flow already had: when the run stops waiting while its card is open (answered from the command line, another window or a timer), the card drops its answers, its refusal and "Waiting since", and says "This is no longer waiting for you. It was answered somewhere else or the run moved on." with **Open run**. Before, the card stayed live after the list had emptied (F8).

The answer buttons' tooltip now shows only when a button cuts its label off. The requirement said "its name and its tooltip are the whole label" for every button, so the full-width **Approve** showed a tooltip "Approve" over its own label (F20). A cut-off label still has the whole label as its tooltip. Nothing else is removed or weakened.

## Decided by the team

- The stale line takes focus only when focus was in the card (the buttons that had it are gone), never from the list or another page.
- No new words: the stale line is the one the card already shows when the engine refuses an answer as decided elsewhere.

## Covers

- inbox.wait-card
