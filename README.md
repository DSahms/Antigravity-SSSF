# C.R.E.W. Software

Under **C.R.E.W. Technologies**. A personal workspace that turns an idea into a reviewed software result through a guided interview and a deterministic Python workflow.

## Open the prepared application

Double-click **Start-Crew.cmd** on Windows. It starts the local service and opens your browser. Start your LLM router separately. Saved connections and the router's `auto` model choice are preserved.

## Prepare from source

```powershell
Set-Location studio
bun install
bun run build
bun run server/index.ts
```

Open http://127.0.0.1:4620. Git, Node.js, uv, and the Pi coding-agent CLI are required for software workflows. There is no packaged installer yet.

## Manuals

- [User's Manual](docs/users-manual/index.html): operate the application.
- [Learner's Manual](docs/learners-manual/index.html): setup, five short lessons, interactive walkthroughs, checkpoints, and maintenance.
- [Implementation status](docs/CREW_IMPLEMENTATION_STATUS.md): verified behavior and remaining blockers.
- [Foundation plan](docs/CREW_PLATFORM_PLAN.md): future direction.

The manuals also open from Help inside Crew.

## Current verification boundary

The UI, controls, permissions, and simulated-agent workflow have passed checks. A live router run reached planning and was stopped by its reporting cap. A complete real generated product is not yet verified. Reporting caps can overshoot when a turn reports usage in a batch. Other industry verticals remain planned.

## Provenance

Based on IndyDevDan's Super Simple Software Factory. The original documentation is preserved under [docs/upstream](docs/upstream/README.md), and the upstream skill remains in `.claude/skills/sssf`. Legacy internal paths remain for compatibility; the active product is C.R.E.W. Software. See [LICENSE](LICENSE).
