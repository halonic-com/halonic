# inbox.answered-view

- Status: active
- Since: unreleased
- Source: HAL-13435 (first-run-flow 3.5, "You did it" after the first run's Approve); Liam's plan review on HAL-13435

When your answer to a wait card is recorded, the Inbox shall ask the views other features added with `Inbox.addAnsweredView` whether one claims it, giving the item, the answer's event and what the run did with it (`continues`, `finished` or `ended`). When one claims it, the card shall be replaced in place by that view, loaded only then, which moves focus to its own title; while it loads, and if it can't load, the card shall stay with its decided bar. When none claims it, the card shall keep its decided bar as before. The function `addAnsweredView` returns shall take the view out again, and a closed workspace's Inbox shall claim nothing.

## Examples

- Given a view that claims an approve that finished run `r43`,
  when you approve `r43`'s wait card and the run finishes,
  then the card is replaced by that view.
- Given the same view,
  when you reject `r43`'s wait card,
  then the card says "Rejected by you at 10:44." and no view replaces it.
- Given a claimed view whose module fails to load,
  when you approve the card,
  then the card stays and says "Approved by you at 10:44. The run finished.".
- Given a view that was added and then taken out again,
  when an answer it would claim is recorded,
  then no view claims it.
