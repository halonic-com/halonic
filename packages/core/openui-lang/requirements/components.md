# openui-lang.components

- Status: active
- Since: unreleased
- Source: HAL-17647

When a reply is read against the chat's component list, the reader shall keep only a card, a table, a form and a row of buttons in a `Stack`, with only their listed arguments: a button holds a label and nothing else, a form field is text, long text, list, choice or tick box, and a link keeps only an `http:` or `https:` address; shall leave out and report any other component (an image included), an extra argument (a style, a class, a variant, a colour or an icon) and a field or link that doesn't fit; and `promptFor` shall list exactly the switched-on components with their arguments.

## Examples

- Given `Button("Yes", "primary")`, when the reply is read, then the button keeps only its label and an `excess-args` error is reported.
- Given `Field("Key", "password")`, when the reply is read at the end, then the field is left out with a `type-mismatch` error.
- Given `Link("Docs", "javascript:alert(1)")` in a card, when the reply is read, then the link is left out and reported.
- Given `Image("cat.png")`, when the reply is read, then it is left out with an `unknown-component` error.
- Given `promptFor(["card", "table"])`, then the text lists `Card` and `Table` with their parts, and no form or buttons.
