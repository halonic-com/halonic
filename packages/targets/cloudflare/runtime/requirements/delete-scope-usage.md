# runtime.delete-scope-usage

- Status: active
- Since: unreleased
- Source: HAL-18015 (part of HAL-13219); selling layer design, sections 4.4 and 4.5

Before a scope's delete erases any store, the Worker shall ask the scope's usage object to erase itself. When usage rows of the scope still wait to go to Cloud, the delete shall erase nothing, and the admin route shall answer 409 `usage_unsent`; the operator runs the delete again once the rows are sent. A Worker without the usage binding has no usage rows and deletes as before.

Rationale: the rows bill use the scope already made, and they hold only ids, numbers and times, so they are kept until Cloud has them rather than wiped with the scope.

## Examples

- Given a scope whose usage object has two rows waiting,
  when the scope is deleted,
  then nothing is erased and the route answers 409 `usage_unsent`.
