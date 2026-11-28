# Decision: the rail's folder facts follow the Changes list, and three rail requirements say what the code does

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20676 (the follow-ups Julian and Liam agreed in their reviews of #6873, to land before the rail subscribes to the facts). Liam approves the change in review on HAL-20676.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:iUQtyhQcgOfilxgmK+SObn3bWA3Ye/5snBza5Irk9Eumt4dXSBYOdcIV/mVVwWIaW54oKplw7aeTIl8chMEtAA==

## What changes

`studio.folder-facts`: the open folder's git state now comes from the Changes list (`ChangesListService`), which reads the folder's history for the Changes page anyway, instead of a second read of the history on every focus and save. So the fact follows Turn on history at once, git runs once per wake, and two reads can't finish out of order. The requirement now says:
- the facts are read again when the rail starts listening, so a change before then shows at once;
- the git state starts from a repository and stays as it was while the Changes list has no answer;
- the facts count the Inbox's own waiting items, and the agents' cards come with HAL-20787.

Its example about an unreadable history is replaced by one about turning on history. The Changes list shows its own read errors, so the facts no longer report them.

`shell.rail`: the check that no entry holds an item kind whose place another entry holds runs once every feature has registered, so the requirement now says `createShell` throws for it, and the message no longer starts with `rail.add:`.

`studio.desktop-rail-selection`: Home's page is a place the shell adds, not a desktop feature, so the requirement says "a desktop feature or the shell". The test's name follows.

New tests cover:
- turning on history without a focus;
- the last git state kept while the list has no answer;
- a run recorded before the rail listened;
- the Inbox counting what waits but not a fixed setup item, and telling the rail once;
- every service unsubscribed when the rail stops.

The test for an unreadable history goes with the code it tested. No other test was skipped or weakened.

## Why

Julian's review of #6873 found that the second read missed Turn on history, which rail flows line 7 names, and doubled git's work. He also found that nothing tested the Inbox half of the facts. Liam asked for a "not read yet" state and for out-of-order reads to be dropped: the Changes list covers both. Julian's nit on the `rail.add:` wording and Nora's on Home's wording (#6852) are requirement text, so they are here.

## Covers

- studio.folder-facts
- shell.rail
- studio.desktop-rail-selection
