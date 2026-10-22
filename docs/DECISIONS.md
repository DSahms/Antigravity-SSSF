> Historical record: this file describes an earlier implementation. Current product behavior and verification are in [CREW_IMPLEMENTATION_STATUS.md](CREW_IMPLEMENTATION_STATUS.md) and the latest [HANDOFF.md](HANDOFF.md). Preserve the history below; do not treat superseded findings as current.

# DECISIONS.md — Design & Architecture Choices

One or two lines each. Logged as we go, per the mission's working protocol.

## D1 — Branch & commits
Working on `flow-and-onboarding`. Committing after each step with `crew: <step>` prefix. No remote push.

## D2 — Keep the name, identifiers, package, repo paths
Per the hard constraint, the repo stays `Antigravity-SSSF`, the package stays `sssf-studio`, the dir stays `studio/`, the API stays `/api/studio/*` and `/api/sessions/*`. Only the user-visible product label changes to "CREW" in copy/headers. This keeps every existing API contract intact and avoids a rename ripple.

## D3 — Add `@floating/dom` for the onboarding tour
The mission explicitly suggests Floating UI. `@floating/dom` is the framework-agnostic core (10 kB), no React/Vue binding needed. We compute position in a tiny composable and apply it to a Vue-rendered bubble. This is the smallest, most proven choice.

## D4 — Add `vitest` + `@vitest/browser` + `playwright` for the tour overlap test
The mission requires an automated test that walks every tour step at three screen sizes and asserts the bubble's box does not overlap the target's box and the target is clickable. This needs a real browser. Playwright via `@vitest/browser` gives us one test runner for both unit and browser tests. If browser-runner setup fails in this sandbox, we fall back to a Playwright-only script and document the fallback.

## D5 — Theme architecture: CSS variables on `:root` and `[data-theme="light"]`
Keep the existing CSS-variable pattern in `style.css`. Add a `data-theme` attribute on `<html>`. Light theme overrides the warm-neutral variables. A small theme store (a Vue ref + `localStorage`) flips it. No CSS-in-JS, no class concatenation everywhere.

## D6 — Warm palette
Light: `--bg: #f7f4ef` (warm paper), `--panel: #ffffff`, `--text: #2a2722`, accent `--terracotta: #b8553f` and `--sage: #5d7a5d`, with `--amber: #c08a3e` for highlights. Dark: `--bg: #1a1814` (warm coffee), `--panel: #221f1a`, `--text: #ece6dc`, same accents muted. Body font: `Inter, "Play", system-ui` (Play is already bundled; Inter we add via `@fontsource/inter`). No neon, no bright blue.

## D7 — Navigation: grouped sidebar + breadcrumbs + step header
Replace the top tab strip with a left sidebar grouped by area:
- **Workflow**: Home, New Job, Review & Approve, Run, Results
- **Observe**: Sessions, History
- **Setup**: Settings, Help
The top bar keeps the project pill + stamp + theme toggle + Help. Each view renders a `ScreenHeader` with the screen's plain name, "step N of M" (when on the main path), and a one-line purpose. Breadcrumbs live under the header.

## D8 — New Job = intake modes + read-back + drafts
Three intake cards on one screen (Talk, Upload, Paste). Upload accepts `.md`/`.txt` via a hidden `<input type="file">`. Paste has a "Paste from clipboard" button calling `navigator.clipboard.readText()`. Starter examples are clickable chips that fill the talk textarea. After any input, a "Read back" panel shows the brief parsed into clear sections; gaps/contradictions are listed and asked one at a time with clickable suggested answers. Sections are editable in place. Drafts auto-save to `localStorage` every 2 s (debounced) and on blur; a "Resume draft" chip appears if a draft exists on load. The original uploaded/pasted text is kept verbatim as an attachment (stored alongside the spec when approved).

## D9 — Approval is multi-step and reversible; server-side enforced
Server gains a `ApprovalBook` that records `{ id, specVersion, specHash, approvedBy, approvedAt, withdrawnAt?, sections: [{ id, name, confirmed, confirmedAt? }], summary }`. The launcher's `launchWorkflow` rejects any request that does not reference a non-withdrawn approval id; the DB stores `approval_id` on the session. UI: per-section checkmarks (toggle, with "undo"), then a review summary panel (what will happen / what it'll use / what it won't / rough time + cost / what can/can't be undone), then one final approval (a single checkbox labelled in words + one "Approve and continue" button — no typing). Withdrawal is allowed before a run starts. Any spec edit after approval creates a new version (increment `specVersion`) requiring re-approval.

## D10 — Run gets Pause + token guard
`WorkflowLauncher` already supports Stop (kill). Add Pause = send SIGTSTP (or, on Windows, suspend via job control fallback) and Resume = SIGCONT. If pause cannot be supported cross-platform cleanly, document and degrade to Stop+relaunch. Token guard: parse `total_tokens` from agent_end events (already in the SQLite stream) and from stdout; cap is configurable per job (default 20 000). At cap, the launcher stops the run with a calm plain-language message in the console and marks the run `status: "stopped"` with a `reason: "token-cap"` field.

## D11 — Settings = connection profiles, one per role
New `ConnectionProfileStore` persisted to `<target>/.sssf/profiles.json` (gitignored). Each profile: `{ role, baseUrl, model, apiKey, reasoningLevel?, hideThinking? }`. Roles seed from the current roster (planner, builder, scout, reviewer, documenter) plus generic ones the mission names (interviewer, researcher, planner, specialist, validator) when no equivalent exists in the roster. UI: per-role card with base URL, model dropdown (filled by "Fetch models" hitting `${baseUrl}/v1/models`), key field (masked, "Paste" button trims whitespace and newlines), reasoning level dropdown (off/low/medium/high/max — matches the existing `THINKING_LEVELS`), hide-thinking toggle, "Test connection" button that does a tiny `/v1/chat/completions` call and explains failures in plain English (key rejected, can't reach URL, model not found). The "local" profile is seeded for every role pointing at `http://127.0.0.1:5001/v1` with `apiKey: "none"` and is the default. The "cloud" (Venice) profile is seeded but disabled until `VENICE_API_KEY` is in `.env`. Keys are never logged.

## D12 — Provider routing
The launcher does not change the Python factory's model id. Settings writes the profile's `model` into the roster YAML's per-agent `model` field (already `provider/model-id` shaped — we keep the provider prefix). For the local profile the provider is `openai` (KoboldCpp's OpenAI-compatible endpoint), so the model id becomes `openai/<kobold-model-id>`. For Venice, `venice/<model>`. The mission's section 9 (Pi agent harness) is time-boxed to three real attempts; we will attempt to write the `models.json` Pi reads and document the outcome.

## D13 — First-run setup is skippable
On very first load (no `localStorage.crew_onboarded`), the app boots into a 3-step first-run: (1) welcome, (2) "connect a model" pointing at the local profile (Skip allowed), (3) "start a New Job". Restarting the tour is always available from Help.

## D14 — Evidence rule
We will not say "tested", "verified", or "working" unless we actually ran it. Where we only checked part, we say which part. Where the sandbox cannot reach a service (KoboldCpp, Venice, Pi), we say so plainly.
