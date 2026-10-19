# Architecture Document

## Overview
This document defines the architectural blueprint for SSSF Studio (also referred to as CREW), a coordinated workflow platform for handling complex administrative tasks such as grants, permits, claims, and filings.

## Core Components

### 1. Frontend (Next.js 16)
- Framework: Next.js 16
- UI Library: Radix + shadcn UI
- State Management: Prisma 6 with SQLite database (`prisma/dev.db`)
- Routing: Standard Next.js routing
- Features: Chat interface for human-intake, responsive design, accessible components

### 2. Backend Engine (Python ADW)
- Location: `adws/` directory
- Configuration: `adw_sssf_config/sssf.config.yaml`
- Runtime: Shells out to a `pi` runtime
- Model Loading: Reads `~/.pi/agent/models.json`
- Role-Based: Supports multiple specialized roles (Interviewer, Researcher, Planner, Specialist, Validator, Scrutiny/Compliance)

### 3. Domain Pack Structure
Each domain (e.g., CREW Grants, CREW Permits, CREW Finance, etc.) follows a standardized pack format:
```yaml
id: <unique-id>
version: <semver>
title: <human-readable title>
starter_cards:
  - "<card description>"
roles:
  specialist: [<role-list>]
rules:
  units: {<unit-mapping>}
  deterministic_steps: [<step-descriptions>]
gates:
  - id: <gate-id>
    requires: human_approval
```

### 4. Case Management
- A "case" represents a single job instance (grant application, permit, time-card reconciliation, etc.)
- Contains: interview transcript, uploaded documents, extracted facts with evidence references, decisions, run history, and status
- Keeps workspace (repo/environment) separate from case data

## Five-Screen Workflow (The Spine)

1. **Home** – Choose a job type (domain pack) or start from an example card. Recent jobs listed with status filters.
2. **Conversation** – AI interview (click choices, file picker, paste). Assistant clarifies missing details.
3. **Review & Approve** – Shows understanding, files used, proposed actions, estimated time/cost. Options: Edit, Ask More, Approve.
4. **Run** – Mission-control view: current phase, completed phases, pending approvals, pause/resume/Stop controls, results.
5. **Settings** – Separate area: connection profiles (per role), domain packs, usage, secrets, help links.

## Roles & Responsibilities

| Role | Responsibility |
|------|----------------|
| Interviewer | Conversational intake; asks what's missing; produces reviewable proposal |
| Researcher | Finds requirements, rules, capabilities, deadlines |
| Planner | Turns approved proposal into ordered phases (factory calls this the "orchestrator") |
| Specialist | Does domain work (code, draft, paperwork) |
| Validator | Independent check; must not be the same model/profile that did the work |
| Scrutiny/Compliance | Checks output against rules; flags missing/conflicting evidence |

## Phases (From Phase 0 of the brief)

### Phase 0: Understand & Document Boundary
- Inspect `src/`, `adws/`, `prisma/`, `docs/`
- Produce `docs/ARCHITECTURE.md` (this document)
- Verify or correct every [VERIFY] item in the brief
- Acceptance: Newcomer can locate every piece of state

### Phase 1: Housekeeping
- Merge `.env.example` and `.env.sample` into a unified `.env.example`
- Prune unused dependencies (after Phase 0 verification)
- Fix `.gitignore` gaps
- Remove machine-specific paths from README
- Add LICENSE decision
- Ensure `npm run verify` runs lint + at least one smoke test
- Acceptance: Fresh clone, following only the README, installs and runs both halves

### Phase 2: Connection Profiles & Settings
- Implement Section 7 (Connection profiles) – paste button, fetch models, test connections, masked keys
- Move all configuration into the Settings area
- Acceptance: All six role profiles can be created/tested via mouse; no keys unmasked or in git

### Phase 3: The Spine
- Implement the five-screen workflow in Section 6 around the existing engine for the **software** domain
- Prove: conversation → approval → Python run → visible progress → result
- Acceptance: One complete job runs end-to-end; run cannot start without recorded approval

### Phase 4: Domain Packs
- Extract software behavior into `domains/software/` using the format in Section 5.2
- Validate schema on load
- Acceptance: Software job behaves identically, now driven by the pack

### Phase 5: Second Domain
- Build `domains/job-costing/` with deterministic arithmetic functions in the engine
- Include synthetic time cards and job sheets (decimal-hour traps like 0.75 h = 45 min)
- Add cases and missing-items checklist view
- Acceptance: Pack runs with no engine changes other than named deterministic functions; validator catches seeded errors

### Phase 6: Documentation
- Generate `docs/users-manual/` and `docs/learners-manual/`
- Stand-in requirement for every repo

## Key Principles (from the brief)

1. **Python is the workflow authority** – UI presents work; engine computes math, dates, totals (never LLM).
2. **Human approval is a hard gate** – Nothing proceeds past intake until explicit user approval.
3. **Deterministic code does the arithmetic** – No LLM for calculations; always Python.
4. **Mouse-only operation** – Prefer choices, dropdowns, buttons, file pickers, Paste over typing.
5. **Settings never interrupt work** – Config lives in Settings area; job screens are clutter-free.
6. **No secrets in code/git** – Credentials entered via UI, stored in OS credential store or gitignored `.env`.
7. **Reuse before rebuild** – Don't add empty placeholders; reserve extension points.
8. **Source repos are read-only references** – Original upstream code is never modified.

## Open Questions (to be answered before shipping)

1. Final product name (CREW or other)?
2. Is the Python engine launched by the Next.js server, run separately, or both?
3. Keep `next-auth` (multi-user later) or remove it (single local user for now)?
4. Should `NOTES.md` and personal exploratory material stay in this public repo?
5. License for the combined work (given upstream project's license)?
6. Which providers/models should ship as presets?

---

*Architecture Document – Version 1.0*
*Generated: 2026-04-10*
*Owner: SSSF Studio Team*
