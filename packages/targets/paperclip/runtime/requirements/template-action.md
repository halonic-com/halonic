# runtime.template-action

- Status: active
- Since: unreleased
- Source: HAL-18141 (plan on HAL-17956, PR 2: templates in the snapshot, read only)

The runtime shall ship a handler for `paperclip.template` that reads only the served snapshot's `templates`, needs no key and no Paperclip capability, and changes nothing. When a tool that runs it is called with a text `id`, it shall answer with that template's text; with no `id`, with the list of template ids and titles; with an `id` no template has, with an error that lists the templates there are; and with an `id` that isn't text, with an error.

## Examples

- Given a snapshot with the templates `card` (titled "Board card") and `task-spec`,
  when Mateo calls `template_get` with `id: task-spec`,
  then the answer is that template's text, and no request is sent.
- Given the same snapshot,
  when `template_get` is called without an id,
  then the answer lists `card: Board card` and `task-spec`.
- Given the same snapshot,
  when `template_get` is called with `id: pr-body` or `id: 7`,
  then it answers with an error, the first listing the templates there are.
- Given a snapshot without templates,
  when `template_get` is called without an id,
  then it answers that the workspace has no templates.
