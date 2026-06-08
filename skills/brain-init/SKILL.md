---
name: brain-init
description: Deep codebase exploration to initialize project memory in Unison. Use when starting work on a new project or when user asks to "index", "learn", or "save this project to brain".
---

1. Explore the project structure: read package.json / Cargo.toml / pyproject.toml, README, main entry points
2. Identify: tech stack, framework, architecture patterns, key directories
3. Find conventions: naming, testing approach, build system, deployment
4. Read core files to understand data models and business logic
5. Write architecture summary: call `unison_write` with path=/private/notes/<project>-architecture.md, tags=["architecture"]
6. Write tech stack: call `unison_write` with path=/private/notes/<project>-stack.md, tags=["stack", "project-config"]
7. Write key conventions: call `unison_write` with path=/private/notes/<project>-conventions.md, tags=["conventions"]
8. Confirm: "Codebase indexed — [N] notes saved to Unison brain for [project name]"
