# std.emitter

- Status: active
- Since: 0.1.0
- Source: replaces the listener sets in the old Studio and workspace list (`packages/core/app/src`) at 784f78d

When an event is sent, the emitter shall call every listener registered for it when sending began, in the order they were added, and a listener shall stop receiving events once its remove function is called.

If one or more listeners throw, then the emitter shall still call the remaining listeners, and then throw the error, or an `AggregateError` with all of them when there are several.

## Examples

- Given two listeners for "saved", when "saved" is sent, then both run, first-added first.
- Given a listener that removes another listener and adds a new one while an event is sent, when the event is sent, then the removed listener still runs this time and the added one doesn't.
- Given a listener that throws followed by one that doesn't, when the event is sent, then the second still runs and the first one's error is thrown.
- Given two listeners that throw "one" and "two", when the event is sent, then an `AggregateError` with message `2 listeners for "closed" failed.` holds both errors.
