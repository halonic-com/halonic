# kit.tooltip-parts

- Status: active
- Since: 0.1.0
- Source: HAL-1290; base component specs 14 (Tooltip), 24.5 (a window tab's tooltip is its full path); UX checklist part 1, 1.2

The kit's `useTooltip` shall give the tooltip of `kit.tooltip` as parts, without the wrapper round the control: the anchor's ref and its pointer, focus and key handlers, the props that link the control to the tooltip, and the tooltip itself, which shall show, hide and be placed under the anchor exactly as the `Tooltip` does. When a tooltip has `showIf` and it answers no at the moment the tooltip would show, on hover or on keyboard focus, the kit shall not show it.

## Examples

- Given a tab with `useTooltip({ text: "Workflows / Support reply" })` spread on the tab itself,
  when a mouse pointer rests on the tab for 500ms,
  then the tooltip shows under the tab, and the tab is described by it with no wrapper round it.
- Given a title's tooltip with `showIf` true only while the title is cut with "…",
  when the title fits and a mouse pointer rests on it for 500ms,
  then the tooltip isn't shown; once the title is cut, it is.
