# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**The guidance itself is in `.claude/CLAUDE.md`, imported below.** If that import
does not resolve for you, read `.claude/CLAUDE.md` directly before writing any
code — it is not optional context.

This file is a stub because it is the one agent file that cannot live in
`.claude/`: Claude Code discovers project memory at `./CLAUDE.md`, and `next dev`
maintains the managed block below at the project root. Hosting that block here
is also what stops `next dev` recreating an `AGENTS.md` beside it — see
`.claude/README.md`.

@.claude/CLAUDE.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
