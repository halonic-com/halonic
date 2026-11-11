# engine.kept-definitions-why

- Status: active
- Since: 0.1.0
- Source: HAL-5214, findings of the 11 Nov code review

When a run's definitions blob exists but can't be read as definitions, because it isn't JSON or doesn't hold a workflow, the error the engine gives (`engine.kept-definitions`) shall also say why, and shall keep the error that caused it as its `cause`. A blob that is missing gives the error as before.

## Examples

- Given a run in `draft` whose definitions blob holds `{`,
  when the model's answer is stepped,
  then the run fails in `draft` with an error that says the definitions are missing or can't be read, and why the blob couldn't be read as JSON.
- Given a blob that holds `{`,
  when the engine reads it as a run's definitions,
  then it throws an error whose `cause` is the JSON parse error.
