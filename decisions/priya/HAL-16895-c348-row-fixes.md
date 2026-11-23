# Decision: an error's reason wraps on List rows, and the waiting time keeps its number with its unit

- Approval: HAL-16895, from the design check HAL-16887 against the board-approved C348 (HAL-14317, A8: "Reasons wrap and are never cut off on rows (the chip moves above)")
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:6ejY96DAWavIG4t8VGwlZvlDjeb8vbCHMdtdl93lvSDK8hXx6LQMVFbxXRsVp4fQotrtruOWHWwBSSvtg/zUCw==

The kit's List cut an error's reason to one line, so on a phone the Agents, Workflows and Home problem rows read "Line 11: options n…". The reason now wraps at any width and is never cut, in the plain List and in both column layouts; on a phone, where a row with a More button put its chip at the start of the meta line, an error's chip gets a line of its own above the reason. Other meta lines are unchanged.

The Inbox row's waiting time joins the number to its unit with a no-break space, so a meta line that wraps never reads "Waiting 10" / "min". The words don't change.

## Covers

- kit.list
- kit.list-columns
- inbox.waiting-time
