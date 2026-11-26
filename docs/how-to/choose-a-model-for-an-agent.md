# Choose a model for an agent

An agent doesn't name a provider or a model. It names a model alias, a short
name such as `fast` or `smart`, and the workspace's `models.yaml` says which
provider and model each alias stands for, and what it costs. To move every
agent that asks for `smart` to another model, you change the alias once, not
each agent.

## Pick the alias

In Studio, open the agent, then **Configuration › Model**, and choose an alias
in the picker. Studio saves the choice to the agent's file:

```yaml
model: smart
```

While the file names no model, the picker shows **Workspace default** and the
agent runs on the workspace's default alias. If the file names an alias the
workspace doesn't have, the picker says so; choose another alias, or add it in
Models.

## Read the line under the picker

Once you pick an alias, a line under the picker says what it stands for:

> **smart** · Anthropic / claude-sonnet-5-5 · €3.00 in, €15.00 out per million tokens

In order: the alias, its provider, the model at that provider, and the price
per million tokens in the workspace's currency. The line follows the picker, so
it changes as soon as you pick another alias.

The end of the line changes when there is no price to show:

- **No price · Add a price**: the alias has no price yet, so estimated spend
  and budgets can't count its calls.
- **On this computer, no cost**: the provider runs on this computer, such as
  Ollama.
- **Built-in test model, no cost**: the alias uses Halonic's test model, which
  gives scripted replies without a network or a key.

There is no line while the picker is empty or shows Workspace default, while
the file names a model as `provider/model` (such as `ollama/llama3.2`) instead
of an alias, or while the file names an alias the workspace doesn't have.

## Change the alias itself

Select the alias name in the line to open it on Models. There you can point it
at another provider and model, set its fallbacks and set its price under
**Price per million tokens**. **Add a price** opens the same tab. A change there
counts for every agent that asks for that alias.

In `models.yaml` the same alias reads:

```yaml
aliases:
  smart:
    provider: anthropic
    model: claude-sonnet-5-5
    price: { input: 3, output: 15 }
```
