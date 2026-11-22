# Decision: C723 wording fixes for the elevated installer, the rollback docs and the trusted-folder filters

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16568 (words check C723 on HAL-16564, of #5272, #5293 and #5291; small wording on approved screens, decided by the team, Sofia, HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6eTgSqW4oSD4AYJtMskm+VCBVoWKvS+iiAM0+keLY0TjDDoTTBAxVteydT34XUJrsQXKyfwEUziSlzmgySTtDg==

**The installer's finish page after a setup with administrator rights.** "✓ The agent sandbox is
set up." didn't say that this setup ran no check, or where to check it. It now reads "✓ The agent
sandbox is set up. To check it, open Settings › Agent sandbox.", in a label two lines high so the
longer text isn't cut. The requirement `studio.installer-elevated` quotes the line, so its text
changes with it, and so does the one test that expects it. Only the quoted words change: what the
installer does, and when it shows the line, stay the same. No test was weakened.

**The uninstaller's time limit.** The removal's timeout said "it didn't finish within 300 seconds";
it now says "Windows didn't finish removing it within 5 minutes", like the install side's "within 5
minutes". No requirement or test quotes it.

**Docs and changesets.** The rollback bullet in `docs/guides/failure-path.md` is split into two
sentences, the two `git-guard` config-key rows say "the user" throughout and read more plainly, and
the two unreleased changesets (`rollback-elevated-stays`, `git-trusted-folder-filters`) take the
C723 wording. None of these is a requirement.

## Covers

- studio.installer-elevated
- apps/studio/src/studio/installer-elevated.test.ts
