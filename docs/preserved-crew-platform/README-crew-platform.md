# CREW Platform

**CREW** means **Coordinated Research, Expertise & Workflows**. CREW Technologies is the company/brand direction; CREW Platform is the shared foundation for domain-specific products such as CREW Grants, CREW Permits, CREW Finance, CREW Estate Planning, CREW Emergency Management, and CREW Business Services. This repository and its GitHub project are named `crew-platform`.

The current implementation proves the software-workflow use case. It builds on the upstream [Super Simple Software Factory](https://github.com/disler/super-simple-software-factory): deterministic Python owns workflow sequencing and acceptance; coding agents are bounded nodes inside that graph. The two local source repositories below contribute complementary capabilities, not a second orchestrator. SSSF remains the name of the upstream engine/configuration where it appears in technical identifiers; it is not the product brand.

## Run the Studio

Install Node.js 20+ and npm, then run `npm install`, `npm run verify`, and `npm run dev` from this directory. Open `http://localhost:3000`. The app creates its local SQLite database during verification. For an optimized local build, use `npm run build` and `npm run start`.

The Discovery conversation uses an OpenAI-compatible chat-completions service. It defaults to `http://127.0.0.1:31415/v1` with model `auto` and no API key, suitable for a local gateway configured to match. Configure workspace-specific `LLM_BASE_URL`, `LLM_MODEL`, and optional `LLM_API_KEY` from **Configuration → AI provider setup** using paste buttons. Optional process-wide defaults can be set in the gitignored app-root `.env`. No key is included in the source.

## Product direction (confirmed 2026-10-11)

- Python is the workflow authority. The interface presents work and progress; it does not create a competing execution graph or source of truth.
- The primary experience is a friendly GUI, not a command line. The user must be able to complete setup and the essential product workflows with zero keyboard typing. Design for mouse-only, one-hand use: prefer choices, guided controls, and clear buttons over text entry. Where a value cannot be selected or generated, support pasting it without requiring the user to type it.
- A user can discuss a goal with an AI, refine it conversationally, review the result, and explicitly approve it before it enters the workflow.
- After approval, the Python-owned workflow runs with visible phases, status, and results.
- Onboarding should be restartable and available for each job, with anchored callouts that explain both what to do and why. The user and learner manuals should also be reachable from the interface.
- Provider/model choices should be configurable by specialist role. Credentials must never be hard-coded; provide a low-friction secure setup path suitable for paste-based entry and use an OS credential store or gitignored `.env`.
- Prove the core path (conversation → approval → workflow → visible run) before adding RAG or other broad platform features.
- CREW Platform is the selected product name and `crew-platform` is the selected repository name. Complete trademark, domain, and existing-product checks before public commercial use.

## UI approach

Treat this primarily as a UI/UX improvement around the existing Python workflow, not as a reason to rewrite the engine. Preserve the working ADW behavior and robustness; reorganize the interface so related tasks are grouped and the user can understand what to do next. Apply the preferred visual style (Anthropic/Claude-inspired, as a reference) consistently. A visual restyle is likely straightforward; validating the new information grouping, accessible zero-typing interactions, and end-to-end flow is the substantive work.

The Factory screenshots at `.\misc` reinforce a useful interaction pattern: give users a small set of starting points, let them describe the job in their own words, and have the assistant clarify missing details before configuring work. Use this as product inspiration, not as a template to clone. Keep the engine's defining contract—Python owns deterministic execution, explicit gates, and approval.

## Primary user journey

Design the product as a guided conversation that leads to a clear, human-approved outcome:

1. **Choose or create a job.** Explain the job in plain language and offer a few helpful starting points rather than exposing workflow internals.
2. **Describe the goal together.** A conversational LLM asks and answers questions, remembers the context for this job, and turns the discussion into a reviewable proposal. The user can answer with choices, use a file picker to upload/reference existing work, or paste copied text; keyboard typing is not required.
3. **Review and approve.** Show what the AI understood, the files and assumptions it used, and what will happen next. The workflow cannot proceed until the user explicitly approves; make edit, ask-more, and approve actions clear.
4. **Carry out the approved steps.** Python runs the deterministic workflow. Present a simple progress view with current step, completed steps, any question or approval needed, and the result. Keep technical detail available without making it the default.
5. **Learn or get help at any point.** Make the User's Manual and Learner's Manual reachable from the app; teach each job with restartable, explanatory onboarding and clear next actions.

Treat this as the product's first complete journey and the foundation for the longer-term Learner's Hub vision. Manuals and onboarding reinforce a coherent interface; they do not compensate for a confusing one.

| Source | What it contributes | Path |
|---|---|---|
| Antigravity Software Factory | Engine + robustness: Python ADW engine, permission rollback, gates, correction-not-restart, Stop Run | `.\Antigravity Software Factory` |
| Software Factory Suite | UX + flow + docs: Next.js control layer, guided tour, Learner's Manual, four-tab "things get checked off" flow | `.\Software Factory Suite` |

**Status: UI foundation in progress.** The Suite's Studio interface is being integrated here; the source repositories remain read-only references.

## Rule of thumb

Keep the Python workflow model as the base; retain Antigravity's engine robustness and improve the Suite's layout, style, conversational approval flow, onboarding, and docs. Any UI framework must remain a client of the Python-owned workflow.

## Verify

From the repository root, run `npm run verify`. The local SQLite database is initialized at `prisma/dev.db`; no database credential or manual `.env` setup is needed.

## First integration milestone

Validate one complete, local workflow before broadening scope: guided setup → conversational intake → review and explicit approval → Python workflow run → understandable live progress and result. Use that proof to settle the UI/runtime boundary and identify what can be reused from each source. Keep the upstream source repositories read-only.

## Docs requirement (standing)

Every repo gets two manuals, generated with the global Kilo commands:

- `/user-manual` — how to install, configure, and use the finished product
- `/learners-manual` — course-style lessons, visual walkthroughs, quizzes, glossary

Output goes under `docs/users-manual/` and `docs/learners-manual/` respectively.
