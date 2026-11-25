# studio.served-inbox-trust

- Status: active
- Since: unreleased
- Source: HAL-18926 (row M12 of the phone Inbox rows, HAL-18394); `studio.served-inbox`, `studio.served-inbox-runs`, `inbox.approval-card`, `inbox.wait-card`

When the computer refuses an answer from the served Studio's Inbox with `403` and the code `workspace_not_trusted`, the answer shall fail as the workspace's trust refusal (`denied`, code `workspace.untrusted`), with a sentence of Halonic's own. The card shall then keep "This workspace isn't trusted yet, so Halonic can't send your answer." with no **Review**, since the served window has no trust check to open, and add where to fix it: "Fix this on your computer: Settings › Trust" on a phone, and "Fix this on the computer running Halonic: Settings › Trust" in a desktop browser, as the Google setup words it. A served card shall have no **Open run**, since the served window has no run pages.

## Examples

- Given a tool call waits on a phone and the workspace isn't trusted on the computer, when you approve it,
  then the card reads "This workspace isn't trusted yet, so Halonic can't send your answer." and "Fix this on your computer: Settings › Trust", with no **Review** and no **Open run**.
- Given the computer refuses an answer with `403` and another code, then the answer fails as `denied` with no trust code.
