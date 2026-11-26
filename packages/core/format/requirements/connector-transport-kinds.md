# format.connector-transport-kinds

- Status: active
- Since: unreleased
- Source: HAL-15123, from Iris's flow check C544 (HAL-15101), item 1; wording after the routine trigger's (HAL-14299), decided by the team; `paperclip` added by HAL-19721

When `parseFile` reads a connector file whose `transport` is missing, isn't a map, or names none of the kinds of transport or more than one, the problem at `transport` shall say "transport needs exactly one of: http, stdio, google, integration, plugin or paperclip." instead of "Invalid input". A `transport` that names exactly one kind and has a mistake inside it shall keep that kind's own problem.

## Examples

- Given a connector file with `plugin: { id: acme-orders }` at the top and no `transport`,
  when it is parsed,
  then the problems are "transport needs exactly one of: http, stdio, google, integration, plugin or paperclip." and "There's no field \"plugin\" in this file.".
- Given `transport: { http: { url: 'https://tracker.example.com' }, plugin: { id: acme-orders } }`,
  when it is parsed,
  then the problem at `transport` names the six kinds.
- Given `transport: { plugin: { idd: acme-orders } }`,
  when it is parsed,
  then the problem at `transport` doesn't name the kinds.
