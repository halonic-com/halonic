# app.live-state

- Status: active
- Since: 0.1.0
- Source: save model 2.4–2.5 ("Changes not live yet", "Runs the live version from 10:42", "Make live and run"; HAL-1102, HAL-3246); engine answer point 4 (HAL-3267); stub `engine.live-state` in req-core-engine

When the live state of an item is asked, the app shall answer `never-versioned` when the live version doesn't have the item, `live` when the item its kind parses from the saved file equals the one at the live version, and otherwise `not-live` with the date of the live version. It shall compare without the fields the item's kind acts on at once (`actsAtOnce`; a routine's `enabled`), and compare a file that doesn't parse on either side, or isn't an item, as text. With history off, it shall answer `live` for every item, because every run reads the saved files. It shall refuse an unsafe or private path with history on or off.

## Examples

- Given agent "briefing" saved but in no version, then its state is `never-versioned`.
- Given "briefing" saved exactly as at the live version, committed at 10:42, then it is `live`; after a saved change to its instructions, it is `not-live` since 10:42.
- Given a saved file that differs from the live version only in comments, key order or quoting, then it is `live`.
- Given routine "morning" that differs from the live version only in `enabled`, then it is `live`; with its name changed too, it is `not-live`.
- Given an agent deleted from the saved files that the live version still has, then it is `not-live`.
- Given a workspace with history off, then every item is `live`.
