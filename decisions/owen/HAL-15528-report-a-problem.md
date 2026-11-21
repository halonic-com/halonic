# Decision: the this-computer-start banner names GitHub and offers Report a problem

- Approval: HAL-15528, item 6 of the flow check C587 on HAL-15498; wording on an approved screen, decided by the team under HAL-2282
- Kind: user-visible
- Task: HAL-15528

## What changes

`runs.run-view.this-computer-start`'s banner now ends "Halonic can't fix this from here: copy the
details and report it on GitHub. Reports there are public, so take out anything private first."
After **Copy details** it offers **Report a problem ↗** ("Opens GitHub"), which opens
`https://github.com/halonic-com/halonic/issues/new` through the host, the address Settings › About
Halonic's Report a problem opens. Copy details, no **Run again**, the general banner for a log
without the step's start, and never naming a sandbox stay as they were.

## Why

The banner told a new user to report the problem but not where, so they had the details on the
clipboard and nowhere to put them. The CLI's line 2 for the same failure names the place
(`https://github.com/halonic-com/halonic/issues`), and Settings › About has Report a problem; the
banner now does both.

The issues are public. Copy details holds the launcher's reason, which is filtered only for secret
shapes and can still name a home folder or a user name. Studio's run page doesn't know the home
folder, so it can't trim it reliably; the sentence asks the person to take out anything private
before posting instead.

Report a problem comes after Copy details, not before, because the details are what the report
needs. The banner model gets `afterDetails` for that: links the page shows after Copy details, and
only with it.

The tests make more `expect` calls than before: one checks the banner's Report a problem, a new
page test checks the order of the buttons and the address it opens. No test was weakened or
removed.

## Covers

- runs.run-view.this-computer-start
