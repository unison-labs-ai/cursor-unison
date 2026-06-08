---
name: brain-search
description: Search the Unison brain for relevant information from past coding sessions. Use when user asks about previous work, past bugs, architectural decisions, or anything that may have been worked on before.
---

1. Call `unison_search` with a focused query based on what the user is asking about
2. If results found, surface relevant documents in your response with context and paths
3. If no results found, try `unison_grep` with a more specific string pattern
4. If still nothing, note that no prior memory exists for this topic
5. For entity-related questions (people, projects, companies), also call `unison_resolve_entity` and `unison_facts_about`
