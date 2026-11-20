# runs.sandbox-cant-run

- Status: active
- Since: unreleased
- Source: HAL-4291 (checklist 3.1 to 3.3, 3.9, 3.10); microcopy 23.3; `app.sandbox-start-words`; `app.sandbox-start-check`. The words are placeholders until HAL-1784 is approved: reviewers check the keys.

The runs feature shall give the pages that start runs one Callout, and one check behind it, for a sandbox that can't start. A page shall check once when it opens, where it has a control that would start a program in the sandbox and the workspace provides `sandboxStartCheckKey`. Only a check that refuses shall disable anything: before it answers, where nothing can check, and when the check itself can't run, the controls stay as they are.

While the check refuses, the Callout shall show, in the warning tone and in this order:

- "*Support reply* can't run: the sandbox can't start on this computer.", which every control it disables names as its description;
- for `other` (and a code Halonic doesn't know) only, the reason sentence;
- the fix for the can't-run Callout from `sandboxStartWords`, with the command it names as code; on a phone, the can't-run Callout's fix for a phone;
- **Check again** and a link, "Read the guide", to the docs section for the reason;
- then the page's own last line, in muted text.

**Check again** shall ask the check now and do nothing else: it never starts a run and never changes a setting. While it waits it is busy, "Checking…", keeps focus and ignores presses. When the sandbox is ready, the Callout goes and "The sandbox works now. You can run *Support reply*." is read politely, and the page moves focus to its control. When it still refuses, the lines change to the new reason and "Sandbox checked: not ready." and the reason is read. When it can't check, the Callout adds "Halonic couldn't check the sandbox. Try again." The Callout has no button, link or menu item that runs without the sandbox.

## Examples

- Given a check that says `bubblewrap-missing`,
  then the Callout reads "Support reply can't run: the sandbox can't start on this computer.", then "Install bubblewrap, for example on Ubuntu or Debian with sudo apt install bubblewrap." with `sudo apt install bubblewrap` as code, then Check again and Read the guide; the fix comes before Check again.
- Given a check that says `from-the-future`,
  then the Callout says "Halonic can't tell what the sandbox is missing." between the first line and the fix.
- Given the same Callout and a check that now passes,
  when the person presses Check again,
  then the Callout goes and "The sandbox works now. You can run Support reply." is read.
- Given a check that throws when the page opens,
  then nothing is disabled and no Callout shows.
