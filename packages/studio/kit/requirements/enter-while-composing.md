# kit.enter-while-composing

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 23 A6 and L9

While an input method is composing text, the kit's `Input` shall not submit its form on Enter. The kit shall treat a key event as composing when its `isComposing` is true or its key code is 229, because WebKit sends the Enter that ends a composition with `isComposing` false.

## Examples

- Given an `Input` in a form,
  when the user presses Enter with `isComposing` true, or with the key code 229,
  then the form isn't submitted.
