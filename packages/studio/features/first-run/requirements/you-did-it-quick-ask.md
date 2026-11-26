# first-run.you-did-it-quick-ask

- Status: active
- Since: unreleased
- Source: HAL-19400 (UX gap G6 from the HAL-19383 walk-through, team decision with the designer: entries on approved screens, no new screen; plan approved by Liam on HAL-19400)

While quick ask's keys work, "Your first run is done." (`first-run.you-did-it`) shall end its "What next?" list with the line "Ask an agent from any app: {keys}", naming the keys as `feedback.help-quick-ask` does: "Ctrl+Alt+Space" until others are saved, and the platform's own key names on macOS, such as "⌥Space". When Settings saves new keys, the line shall name them. Where the app gives no quick ask keys, as in the served Studio, or while the keys don't work (taken by another app, on Linux with Wayland, or where Studio hears no keys), the card shall show no such line, so it never names keys that do nothing.

## Examples

- Given the first run finished on Windows with quick ask's keys working,
  when "Your first run is done." shows,
  then the last line under "What next?" reads "Ask an agent from any app: Ctrl+Alt+Space".
- Given another app holding Ctrl+Alt+Space,
  when "Your first run is done." shows,
  then "What next?" has no line about quick ask.
