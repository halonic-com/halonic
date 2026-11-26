# Decision: the framed sidebar, the same in the Messenger, the Inbox and Studio

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19923 (the board's correction on HAL-10, 26 Nov 16:53 UTC: "the sidebar of messenger was good how it was, in the frame. I meant to do the same at studio and inbox"; plan approved by Liam on HAL-19929)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5DLCtgN8OZ40mWd19PwBf/Qzj/Dzke+FRf331dyb/Eo88BQgmLAcrhKrnKnooRx2aBu9rO8dyUFSAaF0MFjiDg==

HAL-19921 put the Messenger's chat list back on the window's frame (`messenger.framed-list`).
The board asked for the same framed sidebar in the Inbox and in Studio. The kit now draws it once
(`kit.framed-sidebar`), the Messenger uses it, and the Inbox window gets it
(`inbox.framed-sidebar`).

Studio's window changes with it, so three released Studio requirements change their wording:
`shell.frame` (the sidebar sits on the halo beside the framed panel, instead of inside one panel),
`shell.engine-line` (its line sits over the page only, at the top of the framed panel) and
`shell.sidebar-resize` (the edge sits over the sidebar's end edge, which no longer draws a
border). No test checks less. The frame's test now checks the framed panel instead of the old
one, and a new test checks the sidebar on the halo, the Places drawer in a narrow window, and the
phone layout keeping the same page.

## Covers

- shell.frame
- shell.engine-line
- shell.sidebar-resize
