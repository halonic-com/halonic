# Decision: Check again on a stopped plugin says the next run tries the sandbox again

- Approval: HAL-15482 (Paperclip task), from words check C584 row 13 on HAL-15471; a small addition to the approved R15 screen, decided by the team under HAL-2282; the reviewer signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:roGDm9XCdnCsZgcdwVq5Fu4J/dA6ECeP2Z8D1mygURhhFgTwi8311cuPaIsIRHyBaHDck8yqPikVDXfKz5weBQ==
- Task: HAL-15482

## What changes

`plugins.plugin-page-stopped`: **Check again** only has the host forget the plugin's stop; it tries nothing. Until
now the page then jumped to the status box (**On** · "Trusted on …"), which suggests the sandbox works again. Once
**Check again** succeeds, a polite toast now also says "Halonic tries *Plugin* in the sandbox again the next time a run
uses it.", as its failure already says "Couldn't check again: *reason*." in a toast. Focus still moves to the status
box. The second example names the toast, and the source line names C584 and this task. The label and the rest of the
requirement are unchanged.

No test was weakened or skipped. The existing test for **Check again** still checks that the host forgets the stop
and that the status box has focus, and now also checks the toast.

## Covers

- plugins.plugin-page-stopped
