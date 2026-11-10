# contracts.unfenced-run-consent-store

- Status: active
- Since: 0.1.0
- Source: HAL-3385; `UnfencedRunConsentStore` port v1. A yes lets code run without the sandbox, so the store fails closed

Where an adapter implements `UnfencedRunConsentStore`, it shall give back every field of a saved yes and `null` when it has none. Saving again shall replace the yes, and removing shall delete it; removing when there is none shall not be an error. It shall keep what was saved, whatever the caller later does with the objects it passed in or got back. When the saved yes can't be read, `get` shall reject with an error that holds none of its contents in its message or causes; `remove` shall delete it, and saving again shall replace it.

## Examples

- Given a yes for `container`,
  when a yes for `bubblewrap-missing` is saved,
  then `get` gives the second.
- Given a yes that was read,
  when the caller changes `reason` on the object it got back,
  then the next `get` still gives the stored reason.
- Given a yes for `container` that can't be read,
  when `get` is called,
  then it rejects with an error that holds neither `container` nor the time.
- Given a yes that can't be read,
  when it is removed,
  then `get` gives `null`.
