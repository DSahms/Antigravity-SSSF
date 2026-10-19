# SSSF Studio — Work Log

---
Task ID: 1
Agent: Super Z (main)
Task: Build SSSF Studio — a unified web control layer on top of the Super Simple Software Factory.

Work Log:
- Cloned https://github.com/disler/super-simple-software-factory into `/home/z/my-project/sssf-factory` (checked out `example` branch which contains the stamped factory + skill + visualizer).
- Read the factory's core: `sssf.config.yaml` schema, `adw_simple_sdlc.py`, `adw_modules/{agents,tracer,data_types,utils}.py`, `SKILL.md`, `references/config.md`, `install.py`, the visualizer server/db. Confirmed `uv` is available; `pi` is not (so real runs fail at `agents.validate()` — expected, surfaced in the UI).
- Initialized the Next.js 16 fullstack environment via the init script.
- Set up Prisma schema (Workspace, DiscoverySession, Message, Approval, Launch) + `db:push`. Installed `better-sqlite3` (readonly reader for the factory's trace DB) and `yaml`.
- Built `src/lib/sssf/` helpers: `factory.ts` (stamp/status/list ADWs/rosters), `config.ts` (pure types/constants/validation — client-safe), `config-io.ts` (server-only YAML read/write), `trace.ts` (better-sqlite3 reader mirroring tracer.py schema), `launch.ts` (detached ADW subprocess), `discovery.ts` (LLM Discovery agent via z-ai-web-dev-sdk), `workspaces.ts` (sync), `seed.ts` (demo trace seeder), `api-client.ts`, `ui.ts`.
- Built API routes under `src/app/api/workspaces/[slug]/...`: stamp, adws, discovery (review/chat/approve), config, keys, launch, launches, approvals, trace sessions/detail/events, seed-demo.
- Built the UI: `AppShell` (dark sidebar + 4 tabs), `WorkspaceTab` (create/stamp/status/next-steps), `DiscoveryTab` (chat + live spec editor + structured feedback cards with accept/reject + approve → writes `requests/approved-spec.md`), `ConfigTab` (visual roster editor + raw YAML + API key management), `RunsTab` (ADW selector + launch + native run observer: phases timeline, events stream, envelopes, gates, usage + launch-log view for failed launches).
- Fixed bugs found via Agent Browser verification: split `config.ts` (node:fs) from client-safe module; created the missing `workspaces/route.ts`; fixed `resolveConfigPath` for bare roster filenames; fixed `yaml.stringify` invalid options.
- Verified end-to-end with Agent Browser: workspace create → stamp factory (43 files) → discovery review (real LLM structured feedback) → accept suggestion → approve (file written to repo) → config edit + save (valid YAML) → seed demo trace → observe 10-phase run with 42 events/envelopes/gates → real launch surfaces factory validation error in a launch-log view.

Stage Summary:
- Deliverable: a working SSSF Studio Next.js app at `/` (preview link: https://preview-<bot-id>.space-z.ai/).
- The factory code and ADW scripts are untouched — SSSF Studio treats it as a black box, invoking `uv run adws/<adw>.py "<spec>" --config <cfg> --adw-id <id>` from the target repo.
- Discovery → approval → approved markdown in target repo → factory launch, all in one workspace.
- Lint clean; no runtime/hydration errors; all four tabs browser-verified.
- In a target repo with `pi` + API keys configured, launches run the real factory chain and stream into the trace DB the observer polls.

---
Task ID: 2
Agent: Super Z (main)
Task: Hard-code LLM credentials, add Anthropic-style theming with light/dark toggle, markdown upload in Discovery, and embed the official Vue visualizer as an alternate run view.

Work Log:
- LLM: created src/lib/sssf/llm.ts with hard-coded defaults (baseURL http://127.0.0.1:31415/v1, apiKey freellmapi-..., model "auto"), OpenAI-compatible chat completions via fetch. Switched discovery.ts off z-ai-web-dev-sdk onto this helper. Overrideable via LLM_BASE_URL/LLM_API_KEY/LLM_MODEL env. Errors surface as clean, actionable messages ("Could not reach the LLM gateway at...").
- Theming: next-themes (dark default, class strategy) + Newsreader serif headlines + Inter body via next/font/google. New globals.css with a warm Anthropic-inspired palette: light = warm cream (#faf9f5) + clay accent (#c15f3c); dark = warm charcoal (#1c1b18) + Claude clay (#d97757). Semantic tokens (--bg/--fg/--surface/--accent/--success/--danger/--warning) drive all components. ThemeToggle in the sidebar footer. Bulk palette-swap across all 4 tabs (zinc/emerald/rose → semantic tokens). Serif display headings on all page titles.
- Markdown upload: Discovery spec editor now has an "Import .md" button (hidden file input, accepts .md/.markdown/text) + drag-and-drop on the editor area. Loads file content into the draft, switches to Edit view, toasts confirmation.
- Visualizer embed: copied the factory's official Vue visualizer to mini-services/visualizer/ (untouched original). Patched the COPY's server to accept per-request ?db=<absolute path> (cached by path) so one server serves every workspace. Patched the COPY's src/lib/api.ts to append XTransformPort=4600 + db=<db> (read from page URL) to every API call so the gateway forwards correctly. Built the Vue frontend to dist/. Running the Bun server on port 4600 in the background. Runs tab now has a third sub-tab "Visualizer" that iframes /?XTransformPort=4600&db=<enc>#/<adwId>. Fixed a polling effect that was resetting the sub-tab on every poll (now only auto-switches when the active session changes).
- Excluded mini-services/** and sssf-factory/** from eslint; relaxed react-hooks/set-state-in-effect for the standard next-themes mounted pattern. Lint clean.

Stage Summary:
- All four features implemented and browser-verified: dark/light theme toggle works, markdown upload loads file content into the spec editor, the visualizer iframe renders with the correct gateway URL (verified the server serves SPA + API with per-request ?db=), and the Discovery agent uses the hard-coded LLM credentials with clean error handling when the endpoint is unreachable.
- The visualizer mini-service runs on port 4600; the Caddyfile already handles XTransformPort forwarding.
- Note: the LLM gateway at 127.0.0.1:31415 is the operator's local server — unreachable from this sandbox, so Discovery reviews return a clean "Could not reach the LLM gateway" error here, but will work in the operator's environment.

---
Task ID: 3
Agent: Super Z (main)
Task: Add a guided onboarding tour (re-triggerable, dismissible, pointer-tail bubbles) and a complete Learner's Manual (HTML documentation with course, walkthroughs, quizzes, glossary, troubleshooting).

Work Log:
- Onboarding tour: created src/lib/tour-store.ts with 12 steps that switch tabs as they go, each pointing to a data-tour region. Added data-tour attributes to key elements across all 4 tabs + sidebar. Built src/components/sssf/TourOverlay.tsx — spotlight with ring cutout, popover with pointer tail, Next/Back/Skip/Done, keyboard nav (arrows + Esc), progress dots. Auto-starts on first visit (localStorage flag), restartable from sidebar. Wired into page.tsx.
- Sidebar buttons: "Take the tour" (restarts tour) + "Manual" (opens /learners-manual/index.html in new tab) added to the footer alongside the theme toggle.
- Skills check: confirmed `codebase-to-course` and `walkthrough` skills are NOT available in this environment. Implemented equivalents per the master prompt: an interactive HTML course with quizzes (codebase-to-course equivalent) and Mermaid-based visual walkthroughs (walkthrough equivalent).
- Learner's Manual: built as a static HTML site in public/learners-manual/ (4 files, ~130KB, no build step, works offline, hostable on GitHub Pages):
  - index.html: shell with sidebar, content area, search, theme toggle, prev/next
  - styles.css: Anthropic-inspired warm palette (dark default + light), Newsreader serif headlines, Inter body, callout boxes, cards, quiz styles, Mermaid containers, responsive mobile
  - content.js: 20 pages across 6 groups — Home, Start Here, Installation, 4 Feature pages, Course intro + 6 modules (each with 2 interactive quizzes = 12 total), 3 Walkthroughs (Architecture, Discovery→Launch flow, Trace data flow — all with Mermaid diagrams), Technical concepts, Troubleshooting (9 common issues), Glossary (37 terms), 3 Developer guide pages
  - app.js: hash router, sidebar nav builder, client-side search (filters nav + glossary), quiz interaction (click answer → green/red feedback + retry), theme toggle with Mermaid re-render, copy-code buttons, mobile nav, mermaid.init
- All content drawn from the actual codebase (real file paths, real function names, real schema tables, real system prompt excerpts). No fabricated screenshots. Mermaid diagrams render as SVG via CDN.
- Verified with Agent Browser: tour auto-starts, walks through all 4 tabs with spotlight + popover; manual loads, home renders, nav works, course module renders with quiz, quiz interaction gives correct/incorrect feedback, Mermaid diagrams render (2 SVGs on architecture page), theme toggle works, search filters nav + glossary.

Stage Summary:
- Onboarding tour: 12 steps, pointer-tail bubbles, auto-start first visit, restartable, keyboard-navigable.
- Learner's Manual: 20 pages, 6 course modules with 12 quizzes, 3 Mermaid walkthroughs, 37-term glossary, 9 troubleshooting items, developer guide — all in a polished static HTML site with dark/light themes, search, responsive layout.
- Neither `codebase-to-course` nor `walkthrough` skills were available; equivalents implemented as required by the master prompt. No false claims of skill usage.
- Lint clean. Both features browser-verified.
