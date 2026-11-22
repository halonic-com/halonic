# Decision: one look for Not available, and Check again in runtime-missing's fix

- Approval: Paperclip task HAL-16379, design check C701 rows 1 to 3 on HAL-16371 (Noah); small fixes on an approved screen, decided by the team (HAL-2282), words and layout chosen by the designer on the task; Liam signs this note in review on HAL-16379
- Kind: user-visible

Design check C701 found three slips in #5138:

1. **Settings › Agent sandbox drew one state two ways.** A reason from the
   host's check (every Windows code, `distro-missing`, `runtime-missing` and
   `setup-conflict` included) ran the reason and the fix together in one
   paragraph, with the guide on its own line under the buttons. The same
   reason from the start check (a build without the sandbox) had the fix on
   its own line and the guide beside **Check again**. Both now go through one
   component, `NotAvailableFix`: the reason, the fix on its own line (none for
   `setup-needed`; served Studio gets the phone fix), **Check again** as the
   section's ghost button with the refresh icon beside the guide, then the
   run-after-warning line in muted text. `SandboxView` hands the words over as
   `notAvailable` instead of a lead, a guide and a hint.
2. **`runtime-missing` named a button no screen has.** The Inbox card, the
   run page's banner and the can't-run Callout said "Try again", but their
   only button is **Check again**. The fix now says "Choose Check again, …"
   there too, as Settings already did. Every host call, a check included,
   starts the host and so installs the runtime again (HAL-16277).
   On a phone, served Studio comes from `halonic serve` and has no sandbox
   check, so its Check again can't reach the Studio shell that installs the
   runtime. Its fix says: "On the computer Halonic runs on: open Halonic
   Studio, and it finishes the setup. If it still doesn't finish, reinstall
   Halonic Studio."
3. **`distro-missing` said "computer" twice on a phone.** The phone fixes now
   end "use Halonic inside WSL 2." without "on this computer", which on a
   phone pointed at the phone. The desktop words stay the CLI's.

The catalogue gets an optional phone fix of its own for these two reasons.

The requirements change only in this:

- `app.sandbox-start-words`: "On a phone, the can't-run Callout's fix is that
  fix after 'On the computer Halonic runs on: '" now allows a reason's own
  phone words; "`runtime-missing`'s fix shall say to try again" now says to
  choose Check again, with the phone form above; `distro-missing` gets its
  phone form. Two examples change and two are added.
- `settings.agent-sandbox-not-available`: says how the lines look, and that
  a reason from the host's check looks exactly the same, with an example.
- `settings.agent-sandbox-state`: the Not available words are drawn as
  `settings.agent-sandbox-not-available` draws them.

No test is removed or skipped. In `packages/core/app`'s words test, the check
that every can't-run phone fix is the desktop fix after the prefix now skips
the two reasons with phone words of their own, and checks instead that no
phone fix starts with "it" or "them"; each of the two gets a test of its own
phone words, and `runtime-missing` also checks that no form says "try again".
In Settings' state test, the seven Not available tests check
`notAvailable`'s reason, fix and guide instead of the joined lead, the guide
and the hint, which those words now carry. `not-available.test.tsx` adds two
tests: the look of the lines, and the same markup from either check.

## Covers

- app.sandbox-start-words
- settings.agent-sandbox-not-available
- settings.agent-sandbox-state
