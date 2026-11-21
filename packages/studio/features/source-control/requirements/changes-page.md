# source-control.changes-page

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.1 and 2.10; req-source-control (HAL-110) revision 4: `not-a-repository`, `refresh-on-focus`; microcopy revision 94, 16; HAL-9756 (ux-checklists-engine-summarize-changes, HAL-10612, 4)

The Changes page shall show "Changes" and, under it, what the open workspace's history says. While the first read is still working it shall show skeleton rows labelled "Loading changes"; when that read fails, "Couldn't load changes" with the reason and Try again; and when a later read fails, it shall keep what it showed and add "Couldn't load changes", the reason and Try again above it. The reason shall read as a sentence, without git's "fatal:" or "error:" label. A folder inside a larger git repository, which the shell refuses with `folder_not_opened` for `rev-parse` or `init`, shall show the info note "Your folder is part of a larger git repository, so Halonic can't show its changes here. See them with git." with no button, in place of "Couldn't load changes"; any other refusal stays "Couldn't load changes" with the reason and Try again. A folder that is not a git repository shall show "Keep a history of your work" with Turn on history, which makes the folder a repository whose `.gitignore` lists `.studio/`; when that fails the page shall say "Couldn't turn on history." and the reason. Without the git program the page shall show "Halonic needs git to keep versions." with How to install git and Check again, which says "Checking…" while it reads and "Still can't find git." when git is still missing. Turn on history says "Turning on history…" while it works, and the focus then moves to the heading. A repository with no changed file shall show "Nothing has changed since your last version.". The sidebar's Changes shall show the number of changed items, nothing at zero, read "Changes, 3 changes", where the files of one item count once and a file that no kind places counts as one, and the page and the count shall be read again when the window comes to the front or after a save.

## Examples

- Given a folder that is not a git repository,
  when the Changes page opens,
  then it says "Keep a history of your work", and Turn on history makes the folder a repository with `.studio/` in its `.gitignore`.
- Given a computer without git,
  when the Changes page opens,
  then it says "Halonic needs git to keep versions.", and Check again reads again after the person installed it.
- Given a repository where `hubs/sales/hub.yaml` and `skills/tone/SKILL.md` changed,
  when the sidebar draws,
  then Changes shows 2 and is read "Changes, 2 changes".
- Given a repository with no changed file,
  when the Changes page opens,
  then it says "Nothing has changed since your last version." and the sidebar shows no number.
- Given the person edits `models.yaml` in another editor and comes back to Studio,
  then `models.yaml` counts as changed without a click.
- Given a read that fails before any read worked,
  then the page says "Couldn't load changes" with Try again.
- Given a workspace folder inside a larger git repository,
  when the Changes page opens,
  then it says "Your folder is part of a larger git repository, so Halonic can't show its changes here. See them with git." with no button.
