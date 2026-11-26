# Decision: Quick ask's row says "taken" in Send feedback's words, and the box opens on its question row

- Approval: the designer decided the wording on HAL-19570, and the opening state was designed on HAL-19384 for HAL-19510; team decisions on details of an approved screen (HAL-2282 rule); Liam signs this note in review
- Kind: user-visible

Settings → Keyboard showed one refusal in two wordings: Send feedback's row says
"{shortcut} is taken by another app. Choose another." and Quick ask's row, right
under it, said "… Pick another key.". The designer decided on HAL-19570 that both
rows use Send feedback's line, so Quick ask's row now calls `takenLine` and
`askKeysTakenLine` is gone. Only the requirement's words and its two examples
change; what the row does is the same.

#6587 (HAL-19821) gave the opening box a loading view while this branch was in
review: skeleton bars in the question row's place, with no text box until the
agents arrive. This branch builds the opening state HAL-19384 designed for the
box instead: the question row shows at once with the text box focused and
taking typing, and only the agent button is a skeleton. Keeping both would draw
the box twice. The focused text box also lets Esc close the box while it opens
(Liam's finding on #6587, HAL-19882). So `quick-ask.opening` is retired for
`quick-ask.box-states`, which keeps its "Loading your agents" announcement after
300 ms, and its test file goes with the view it tested. That includes the
alignment test #6628 (HAL-19950) added: the skeleton circle now sits in the
agent button's own `p-0.5` box next to the real text box, so nothing can shift
when the agents arrive.

## Covers

- feedback.settings-quick-ask
- quick-ask.opening
- packages/studio/features/quick-ask/src/ui/opening-view.test.tsx
