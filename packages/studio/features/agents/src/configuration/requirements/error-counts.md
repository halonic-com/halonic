# agents.configuration.error-counts

- Status: draft
- Since: unreleased
- Source: HAL-17270; flow-agents 3.1 (nav badges) and 5.1 ("Each page shows its error count next to its name"); UX checklist part 2, 2.3 (T6-F25); the workflow page's counters

While the agent's file has errors that a Configuration page shows, the agent's Configuration shall show their number as a danger counter at the end of that page's name in the page list, and the Configuration tab of the agent page shall show the sum of the pages' counters, each read to a screen reader as "1 error" or "*n* errors" after the name. The errors counted shall be the Model page's model that isn't a model alias of the agent's hub, and each of the Tools page's skills, knowledge and connectors that the hub can't use. A page whose list can't be read shall count none. The counters shall follow the file, also before the person opens the page that has the errors, and shall go when the errors are fixed. A page with no errors, and the Configuration tab when no page has any, shall show no counter.

## Examples

- Given the file names the model smrt and the hub has only the aliases fast and smart, when the person opens the agent's page, then the Configuration tab shows 1 and reads "Configuration, 1 error", and in Configuration the Model page shows 1.
- Given that agent also names the skill gone-skill, which the hub's Library doesn't have, then the Tools page shows 1 and the Configuration tab shows 2.
- Given the person then picks the alias smart on the Model page, then the Model page shows no counter and the Configuration tab shows 1.
- Given the Library can't be read, then the Tools page shows no counter.
- Given a file with no such errors, then no page and no tab shows a counter.
