# Changesets

A changeset is a short file that says what changed for the people who use
Halonic. Only what we ship gets a version and a changelog: the CLI and the
Studio app. Every other package is private and has neither.

**The rule:** if users will notice the change, add one with `pnpm changeset`,
and write one sentence a user would understand. If they won't notice it, add
none and write "None (no user-visible change)" in the pull request template.

Good: `Routines now fire interval triggers at the right time.`
Not good: `Fix off-by-one in tick().`

Versioning and publishing are not set up yet; they come with the release
workflow. Until then, changesets only collect.
