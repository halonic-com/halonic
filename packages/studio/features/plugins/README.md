# @halonicjs/studio-feature-plugins

The Studio side of plugins. Studio draws everything a plugin shows: the plugin only describes it in its manifest's `ui` (ADR `docs/adr/2026-11-09-plugins.md`, section 5; design on [HAL-1739](/HAL/issues/HAL-1739#document-design)).

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-plugins` (the feature) and `@halonicjs/studio-feature-plugins/api`

## Example

```tsx
import { PluginResult } from "@halonicjs/studio-feature-plugins/api";

<PluginResult show="markdown" text={"# Today\n**Sunny**, see [the map](https://example.com)"} />;
```

`PluginResult` draws a command's or card's answer as its `show` asks (requirement `plugins.plugin-text`):

- `text`: plain text, line breaks kept.
- `markdown`: paragraphs, headings (as a bold line), bullet and numbered lists, quotes, code, **bold**, _italic_ and links to `http` or `https` pages through `ExternalLink`. Images, HTML and any other link stay as their own characters.
- `table`: a JSON list of objects, one per row, such as `[{"day":"Mon","high":21}]`. Anything else shows as plain text.
