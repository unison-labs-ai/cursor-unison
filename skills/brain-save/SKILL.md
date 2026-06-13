---
name: brain-save
description: Save important information to the Unison brain. Use when user explicitly asks to remember something, or when you've solved a significant problem worth preserving.
---

1. Extract the key insight, decision, or solution to save
2. Choose path: /private/notes/ for personal, /workspace/ for team-shared
3. Choose tags: one or more of preference, architecture, error-solution, project-config, learned-pattern, decision
4. Write a concise tldr (one sentence) and a full body in Markdown
5. Call `unison_write` with the path, body, title, tldr, and tags
6. Confirm to user that the information has been saved and show the path
