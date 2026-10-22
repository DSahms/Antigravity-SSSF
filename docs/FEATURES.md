> Historical record: this file describes an earlier implementation. Current product behavior and verification are in [CREW_IMPLEMENTATION_STATUS.md](CREW_IMPLEMENTATION_STATUS.md) and the latest [HANDOFF.md](HANDOFF.md). Preserve the history below; do not treat superseded findings as current.

# CREW (SSSF Studio) — Feature Inventory

> Step 0 baseline. Every user-facing feature, where it lives in the code, and how to exercise it. A missing feature at the end of this work is a bug, not a trade-off.

Working product name: **CREW** (not final). The repo, package, and identifiers remain `sssf-studio` / `studio` / `SSSF Studio` per the constraint.

## Tech stack (do not change)

- **Frontend**: Vue 3 (`vue@^3.5.13`) + Vite 7 + TypeScript 5.7, Bun runtime.
- **Backend**: Bun `Bun.serve` with route patterns (`studio/server/index.ts`).
- **Icons**: `lucide-vue-next`. **YAML**: `yaml` package.
- **No Tailwind** — utility classes like `text-xs` in templates are inert. Real styling lives in `studio/src/style.css` (CSS variables) and scoped `<style>` blocks.
- **Python factory** (`adws/`) is a deterministic black box. We never modify it.

---

## 1. Project switching & stamping
**Where**: `studio/src/App.vue` (top bar project pill, switch modal, stamp modal). `studio/server/project.ts` (`ProjectManager`). API: `GET /api/studio/project`, `POST /api/studio/project/select`, `POST /api/studio/project/stamp`.

**How to exercise**: Click the project pill in the top bar → enter an absolute path → "Open Directory". If the target repo is not stamped, a "Stamp Factory Here" button appears → opens a modal → "Execute Install Stamp" runs `uv run .claude/skills/sssf/scripts/install.py` and streams the log.

**Surface area to preserve**: project pill, switch modal, stamp modal, status badges (Stamped / Not Stamped, git branch, env/db/config presence).

## 2. Discovery / Intake (current form)
**Where**: `studio/src/views/DiscoveryView.vue`. `studio/server/discovery.ts` (`DiscoveryEngine`). API: `GET /api/studio/discovery/session`, `POST /api/studio/discovery/analyze`, `POST /api/studio/discovery/chat`, `POST /api/studio/discovery/suggestion/{accept,reject}`, `POST /api/studio/discovery/question/answer`, `POST /api/studio/discovery/spec`, `POST /api/studio/discovery/approve`, `POST /api/studio/discovery/reset`, `GET /api/studio/discovery/history`.

**How to exercise**: Discovery tab → paste a rough description into the left intake → click "Analyze" → review Missing Requirements, Ambiguities, Suggestions (accept/reject), Open Questions (answer with choices), Risks → watch the right-pane spec markdown update → edit spec markdown directly → switch left pane to Chat → refine conversationally → click "Approve Specification" → fill filename + author → confirm. The approved spec is written to `<target>/requests/<name>.md` with metadata header, and the audit record is appended to `<target>/adws/adw_data/studio_history.json`.

**Surface area to preserve**: rough-input analysis, structured 5-dimension review, suggestion accept/reject with patch, question answer with choices, live editable spec markdown, approve-to-file with audit history, reset session.

## 3. Agent Roster editor (current form)
**Where**: `studio/src/views/ConfigView.vue`. `studio/server/config.ts` (`ConfigManager`). API: `GET/POST /api/studio/config`, `GET /api/studio/rosters`, `POST /api/studio/rosters/save`, `POST /api/studio/rosters/apply`, `GET/POST /api/studio/env`.

**How to exercise**: Agent Roster tab → visual editor shows per-agent cards (model, thinking level, tools, writes, color, purpose). Pick a named preset from the dropdown (Factory Default / Frontier Reasoning / Rapid Economy / custom saved) → "Apply" rewrites `sssf.config.yaml`. "Save As Preset" prompts for a name and writes to `adws/adw_sssf_config/rosters/<name>.yaml`. Switch to YAML tab → raw edit. Switch to ENV tab → see masked API keys (OPENROUTER, OPENAI, FIREWORKS, ANTHROPIC, GEMINI) → click a key to edit → paste value → save to `<target>/.env`.

**Surface area to preserve**: visual per-agent editor, YAML raw editor, preset apply/save, env key status (masked), env key set. Preserve the existing presets data (Factory Default / Frontier / Rapid Economy).

## 4. Workflow launch (current form)
**Where**: `studio/src/views/LaunchView.vue`. `studio/server/launcher.ts` (`WorkflowLauncher`). API: `GET /api/studio/workflows`, `POST /api/studio/launch`, `GET /api/studio/runs/active`, `GET /api/studio/runs/:run_id`, `POST /api/studio/runs/:run_id/stop`.

**How to exercise**: Launch tab → pick a workflow card (Simple SDLC, Plan Build Test, Plan Build, Build Test, Build Review, Plan, Scout, Prompt, Quality, Document) → choose prompt mode: "Approved Specification" (dropdown of `requests/` and `specs/` markdown files) or "Ad-Hoc Custom Prompt" (textarea) → click "Launch Workflow". The launcher spawns `uv run adws/<script>.py --config <path> <prompt>` in the target dir, streams stdout/stderr line by line, parses `adw_id` and current phase from output, and shows a live terminal on the right. "Stop Run (PID: N)" kills the process. "Trace UI" jumps to Observability with the adw_id preselected.

**Surface area to preserve**: workflow discovery (all `adws/adw_*.py`), prompt modes (approved-spec + custom-text; `file` mode is in the API but not surfaced), launch + live console + stop + jump-to-trace.

## 5. Observability / trace visualizer
**Where**: `studio/src/views/ObservabilityView.vue` and `studio/src/components/visualizer/*` (`SessionsList`, `SessionTrace`, `SessionCard`, `PhaseDetail`, `PhaseDots`, `DetailSection`, `StatusChip`, `StatChip`). `studio/server/db.ts` (`SssfDb`) and the visualizer endpoints in `studio/server/index.ts`. API: `GET /api/health`, `GET /api/sessions`, `GET /api/sessions/:adw_id`, `POST /api/sessions/:adw_id/archive`, `GET /api/sessions/:adw_id/events`, `GET /api/sessions/:adw_id/envelopes`, `GET /api/sessions/:adw_id/gates`, `GET /api/sessions/:adw_id/agents/:agent/prompts`.

**How to exercise**: Observability tab → sessions list (polls SQLite at 500ms) → click a session → trace view: phase waterfall, agent color-coded lanes, expandable tool calls, gate verification, typed JSON envelopes, token spend, context window bar. Click a phase to expand details. "All Sessions" returns to the list. Archive toggles via the session card.

**Surface area to preserve**: all of the above. This is the richest view and must not regress.

## 6. History / audit
**Where**: `studio/src/views/HistoryView.vue`. API: `GET /api/studio/discovery/history`. Backed by `<target>/adws/adw_data/studio_history.json`.

**How to exercise**: History tab → list of approval records on the left, content preview on the right. Click "Launch Workflow" to jump to Launch with the spec preselected.

**Surface area to preserve**: approval list, content preview, launch-from-history.

---

## Things that exist in code but are NOT user-facing features (do not surface as features)

- `LaunchRequest.promptMode === "file"` — supported by the launcher, not exposed in the UI. We will surface it as part of New Job upload.
- `ConfigManager.KNOWN_API_KEYS` — env keys for openrouter/openai/fireworks/anthropic/gemini. The new Settings view will introduce a different profile model (local + cloud), but the existing env-key surface must keep working so existing rosters keep validating.
- `SssfConfig` protected files, data dir, observability poll_ms — these remain in the YAML; the new Settings view does not remove them.

## Things that are explicitly broken or absent today (and the mission asks us to fix)

- No real flow: tabs are flat, no step counters, no breadcrumbs, no grouped sidebar.
- No onboarding. No tour. No Help button.
- Bright blue on dark zinc — fatiguing. No light theme.
- No clipboard Paste button anywhere. No starter examples. No draft autosave.
- Approval is a single modal with filename + author. No per-section confirmation, no plain-language summary, no version tracking, no withdraw, no server-side enforcement.
- No Pause. No per-job token guard.
- No Settings area for connection profiles. No "Fetch models", no "Test connection", no "hide thinking" toggle, no per-role profile.
- No "local" KoboldCpp or "cloud" Venice profile concept. No `VENICE_API_KEY` handling.
- No automated tests of any kind.

---

## Acceptance: at the end of this work, every feature listed in sections 1–6 must still work, and every item in the "broken or absent" list must be addressed per the mission prompt.
