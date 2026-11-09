# Changesets

A changeset is a short file that says what changed for the people who use
Halonic. Only what we ship gets a version and a changelog: the CLI and the
Studio app. Every other package is private and has neither.

**The rule:** if users will notice the change, write one sentence a user
would understand. If they won't notice it, write "None (no user-visible
change)". The sentence goes in the Changeset section of the pull request
template.

**Not yet:** every package is private today, so `pnpm changeset` fails with
"No versionable packages found". Until the CLI and the Studio app are
versioned, do not run it. Once they are, also add the sentence as a changeset
file with `pnpm changeset`.

Good: `Routines now fire interval triggers at the right time.`
Not good: `Fix off-by-one in tick().`

Versioning and publishing are not set up yet; they come with the release
workflow. Until then, changesets only collect.
