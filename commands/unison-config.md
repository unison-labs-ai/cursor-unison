---
name: unison-config
description: Configure Unison Brain settings for this project
---

Create or edit `.cursor/.unison/config.json` at your project root:

```json
{
  "baseUrl": "https://api.unisonlabs.ai",
  "maxResults": 10,
  "maxProjectDocs": 5,
  "injectStatus": false,
  "notesPrefix": null
}
```

Settings:
- `baseUrl`: Override the Unison API URL (default: https://api.unisonlabs.ai)
- `maxResults`: Max search results returned by `unison_search` (default: 10)
- `maxProjectDocs`: Max notes injected at session start (default: 5)
- `injectStatus`: Whether to inject brain status at session start (default: false)
- `notesPrefix`: Default path prefix for notes (default: /private/notes/)

Add `.cursor/.unison/` to your `.gitignore` if it contains an API key.

You can also use the `unison_set_config` MCP tool to update settings without editing files directly.
