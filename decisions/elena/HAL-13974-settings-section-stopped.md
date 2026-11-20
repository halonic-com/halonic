# Decision: a Settings section that stops on the desktop says so

- Approval: the a11y checks C275 on HAL-13936 (SE1) and C289 on HAL-14027 (SE2, SE3), C296 on HAL-14044 (SE4, SE5), and the team's decisions on HAL-14027 and HAL-14044; the team's wording decision on HAL-13974 (a detail of the approved Settings states, under HAL-2282); Liam approves this note in review on HAL-13974
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BEhiuf6/Otd/4aGaBrTIOgy3TAYAsRWGG7mlqUSlT3qZqW2hu3rbGmUuvzGAN3MnxuwCqUmJEJQ2KwofaFbJDQ==
- Task: HAL-13974

## What changes

`shell.page-stopped` gains one sentence and one example: in the desktop app, a Settings section
whose view fails to load or draw shows the page's stopped state in that section only, titled
"Couldn't load these settings" one heading level below the section's name (`h4` under the
dialog's `h3`, `h2` under the phone's `h1`), with the reason "Halonic ran into a problem showing
the _section_ settings. Nothing in your workspace changed.", **Reload page** and **Copy details**.
Until now such a section showed its name and nothing else, with no reason and no way to try again.

It also gains sentences and examples for how a screen reader hears it (C289 on HAL-14027):
in the dialog, where the focus stays in the list, the dialog's polite region reads the title once as
the state shows (SE2, WCAG 4.1.3); and when Reload page draws the section, the focus goes to the
section's name, the dialog's `h3` or the phone page's `h1`, rather than falling to the page's body
(SE3, WCAG 2.4.3).

C296 on HAL-14044 extends both (the team's decisions there, under HAL-2282): the phone's section
page reads the title once through its polite region too, as the dialog does, with the focus left on
its hidden `h1`, which doesn't read the state (SE4, WCAG 4.1.3); and after a Reload page or Try
again that fails again, the focus goes to the state's title and the polite region stays quiet, so a
screen reader says it once, not twice (SE5). `shell.page-unreachable` says the same for its Settings
state. The SE2 test that expected a second reading after a failed Reload page now expects none.

The served Studio and the phone keep what `shell.page-unreachable` says: "Couldn't load these
settings" with **Try again** when the computer can't be reached, and nothing for another failure.

Nothing is removed from the requirement, and no test or expectation is weakened.

## Covers

- shell.page-stopped
- shell.page-unreachable
