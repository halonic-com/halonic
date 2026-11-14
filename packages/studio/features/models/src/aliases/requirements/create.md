# models.aliases.create

- Status: draft
- Since: 0.1.0
- Source: HAL-9386 (design check B10); decided on HAL-9653; microcopy 6.1

When the user chooses **New alias**, the models feature shall ask for a name, a provider and a model in a "New model alias" dialog, write the alias to `models.yaml` as one undo step, close the dialog and open the alias's tab, and, while the name is empty, taken or contains a `/`, or the model is empty, not write the file and show a field error.

## Examples

- Given the Models section, then **New alias** is in its header, and in the empty state under "No model aliases yet".
- Given the dialog, then it has **Name** ("Agents ask for this name, like `fast`."), **Provider**, **Model**, **Cancel** and **Create**, and focus starts on Name.
- Given the user types `cheap` and `gpt-5-nano` and presses **Create**,
  then `models.yaml` is saved with `cheap: { provider: <picked>, model: gpt-5-nano }`, the undo step is "Added model alias cheap" and the tab "Alias: cheap" opens. Price and Fallbacks are edited there.
- Given Name is empty, then it says "Give it a name.".
- Given an alias `smart` exists and the name is `smart`, then it says "There's already a model alias called smart.".
- Given the name is `a/b`, then it says "A name can't contain /. Halonic reads provider/model names as a provider and a model.".
- Given Model is empty, then it says "Give the model's name, like claude-sonnet-5-5.".
- Given the file can't be written, then the dialog says "Couldn't create the model alias: <reason>. Nothing was changed." and **Create** tries again.
