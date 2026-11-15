# Decision: Ctrl Z in a field of workspace content steps the workspace's undo

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-3236 (req-shell rev 6 and 8, `shell.keybindings.one-undo-in-editors`; save model 4.1)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:f7u1biV0o+DdDiJELqAnQsTd5/+mbMgylhJCMdgQe9B6QsXwG03MtFGRDRjs4xNTAjqlFKw6HmQ9Y4bs+zVcDQ==

`workspace.saves-itself` said a text field keeps its own undo. The save model (4.1) decided one undo
history per workspace, shared by the code editor and the structured editors, so a field that shows
workspace content now has no undo of its own: Ctrl Z and Ctrl Shift Z step the workspace's history.
Other text fields, such as the chat message box, still keep their own. The requirement gains this
case and one example. No test was weakened or skipped.

## Covers

- workspace.saves-itself
