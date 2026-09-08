# .claude/

Everything Claude Code reads for this repository.

```
.claude/
├── CLAUDE.md              the project guidance
├── README.md              this file
├── settings.json          shared permissions (committed)
├── settings.local.json    your own overrides (gitignored)
├── skills/
│   ├── emil-design-eng/       UI craft: polish, component decisions, detail
│   ├── animate/               building a motion from scratch, in order
│   ├── improve-animations/    audit existing motion, produce a plan
│   ├── review-animations/     review motion against a craft bar
│   ├── animation-vocabulary/  names the motion effect you are describing
│   └── pick-ui-library/       which library for a given frontend task
└── docs/
    ├── PRD.md                 the original spec
    ├── INTEGRATIONS.md        what is still preview-only, and what bit us
    └── AI_AGENTS_WIRING.md    what remains unwired in Conversation AI
```

`README.md` at the repository root is the long-form documentation and stays
there — GitHub renders it, and it is written for people first.

## The one file that cannot live here

`CLAUDE.md` at the repository root is a **stub** that imports
`.claude/CLAUDE.md`. Two separate mechanisms pin it there:

- **Claude Code discovers project memory at `./CLAUDE.md`.** `.claude/CLAUDE.md`
  is not a discovery path, so without the stub nothing would load it.
- **`next dev` maintains a managed block at the project root.**
  `ensureAgentRulesForDev` in
  `node_modules/next/dist/server/lib/app-info-log.js:125` calls
  `hasCurrentAgentRules(dir)`, which looks for the block in the root `AGENTS.md`
  **or** the root `CLAUDE.md`. Finding it in either one, it writes nothing.

That second point is why **there is no `AGENTS.md` any more**. The managed block
now lives in the root `CLAUDE.md` stub, `hasCurrentAgentRules` is satisfied by
it, and `writeAgentFiles` is never reached — so `next dev` does not recreate the
file. Delete the block from the stub and the next `npm run dev` will scaffold a
fresh `AGENTS.md` at the root to hold it.

## Settings

`settings.json` allows the read-only commands an agent runs constantly here
(`npm run typecheck`, `lint`, `build`, `npx tsc`, `npx eslint`, and the
read-only half of git) so they stop raising a prompt each time. Anything that
writes — `git commit`, `git push`, `db:push`, a shell redirect — is deliberately
not on the list and still asks.

It also denies reads of `.env`, `.env.local` and `SKILL.md`. All three hold live
credentials, and `SKILL.md` is the easy one to forget: it sits at the repository
root looking like documentation, and is gitignored for that reason.

Settings are read at session start, so changes here apply to the next session.

## Skills

Six, kept deliberately small. A skill loads on a description match, so a large
collection is a standing context cost and a wide surface for the wrong one to
fire.

- `emil-design-eng` — UI craft and the details that decide whether something
  feels finished. Chosen because it argues about quality without prescribing a
  visual identity, which this app already has.
- `animate` — building one motion from scratch, taking the decisions in the
  order that determines whether it feels right.
- `improve-animations` — audits the motion already in the codebase and writes
  a prioritised plan.
- `review-animations` — reviews motion against a craft bar, defaulting to
  flagging rather than approving.
- `animation-vocabulary` — a reverse glossary for naming a motion effect.
  Reference only.
- `pick-ui-library` — a lookup table for charts, virtualization, command menus
  and the like. Marked `disable-model-invocation`, so it only runs when asked
  for and costs nothing passively.

The four motion skills all speak Framer Motion (`motion/react`), which **is**
a dependency now — `motion` v13. The CSS keyframes in `globals.css` remain the
default for page transitions, popovers and collapses; Framer Motion is for what
CSS cannot do. `CLAUDE.md` has the split, including the reduced-motion trap.

The UX/UI design skills — the `ui-ux-pro-max` family — are not in this folder
and should not be copied here. They are a marketplace plugin installed at user
scope in `~/.claude/plugins/`, so they already load in every project. Nothing to
maintain per-repo.

Forty-two were on offer, from a collection copied out of another project. The
other thirty-nine were dropped for three reasons worth recording, so nobody
re-imports them:

- **No such dependency.** Ten `threejs-*`, eight `gsap-*` and `motion-design`
  (Lottie). None of `three`, `gsap` or `lottie` is in `package.json`, and none
  of them should be for a CRM dashboard. GSAP is the sharpest cut of the three:
  eight skills of API reference for a library this app does not have.
- **They override the house style.** `design-taste-frontend`, `gpt-taste`,
  `high-end-visual-design`, `minimalist-ui`, `industrial-brutalist-ui`,
  `apple-design`, `stitch-design-taste`, `redesign-existing-projects` and
  `full-output-enforcement` each impose a visual identity or an output rule.
  This app already has one, written down in `CLAUDE.md` and argued for in the
  code; a skill quietly pulling toward editorial serif or brutalist grids is
  worse than no skill.
- **Wrong output.** `image-to-code`, `imagegen-frontend-web`,
  `imagegen-frontend-mobile` and `brandkit` generate design images for landing
  pages. The work here is matching a mockup into an existing dashboard, which is
  the opposite direction.

The originals live in the `WEB AGENCY/voltascales` project if any is ever
wanted back — that copy is the source of truth, and the one to restore from.

## Room to grow

Claude Code also reads `commands/` (project slash commands) and `agents/`
(subagent definitions) from this folder. Neither exists yet; add them here
rather than at the repository root.
