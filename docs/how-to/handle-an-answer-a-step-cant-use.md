# Handle an answer a step can't use

An agent whose `output` is `choice` or `json` must answer with one of its
options or with JSON. When it answers something else, such as "Refund" for
the option `refund` or JSON cut off halfway, the run fails at that step:

```text
The agent sorter answered "Refund", which isn't one of its options (refund, question, spam). Tighten the agent's instructions or use a larger model.
```

Clearer instructions or a larger model fix the cause. Two settings make a
workflow cope when it still happens: give the agent a second try, or send the
run to another step.

## Give the agent a second try

Set `answerRetries: 1` in the agent file:

```yaml
id: sorter
name: Sorter
instructions: Answer with one word: refund, question or spam.
answerRetries: 1
output:
  type: choice
  options: [refund, question, spam]
```

When the agent's answer can't be used, the step asks the same agent once
more, with the step's prompt and then what was wrong with the answer. A usable
second answer finishes the step as if it had come first. A second answer that
can't be used fails the run with the same message as before.

With `answerRetries: 1`, the step also:

- finds the JSON in an answer with text around it, when the answer holds
  exactly one `json` code block or one `{…}` object;
- counts no answer at all as an answer it can't use;
- keeps each answer it couldn't use, in full, in the run log.

The second try is a second model call, so it costs a second call too. Leave
`answerRetries` out, or set it to `0`, to fail at the first answer as before.

## Send the run to another step

Give the step a transition on the event `unusable`. The run then takes it
instead of failing:

```yaml
classify:
  agent: sorter
  gets: [input.mail]
  output: kind
  on:
    - to: review-by-hand
      event: unusable
    - to: draft
```

The step ends with `unusable` once the agent has no try left: at once without
`answerRetries`, after the second answer with `answerRetries: 1`. The step
sets no output, so `context.kind` stays empty. Such a step also finds the JSON
in an answer with text around it, as with `answerRetries`. A usable answer
takes the other transitions, as before.

## Where this works

Both settings work in a `task` step, the usual step with an `agent`. A step
of a `parallel` or a `foreach` fails at the first answer it can't use.
