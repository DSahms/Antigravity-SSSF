# C.R.E.W. Software — implementation and acceptance status

This is the current product-wide status. Older audits and progress files are
historical records, not instructions to undo later fixes. Product scope is the
prepared local software factory: Intake -> Lock -> Build -> Verify. Industry
verticals, a packaged installer, updater and public deployment are future work.

## Implemented product behavior

- Guided intake supports talk/upload/paste, free-form follow-ups, suggested
  choices, editable specification, a re-check action and saved conversation.
- Review requires section confirmation and explicit approval. The server
  enforces project/workflow identity, withdrawal, and execution fingerprints.
  Changes to connections, roster, engine/workflow code, prompts or project
  checks invalidate approvals. Saved identities are resolved server-side.
- Saved per-role connections mask keys in API responses and preserve router
  model identifiers. Project creation and selection isolate runtime records.
- Build/check workflows require project-specific checks. Deterministic quality
  commands persist output and gate records, including failure exit status.
- Runs expose phases, traces, artifacts, usage and bounded persisted logs.
  Restart reconciliation checks recorded engine PIDs before marking a run dead.
  Windows Pause is unavailable; Stop is the supported control.
- Token reporting caps read cumulative SQLite usage after assistant turns and
  before phases, in addition to launcher monitoring. Reported batches can
  overshoot; caps are not exact dollar ceilings.
- Startup checks Bun, Node, Git, uv and Pi and pins port 4620.

## Noncommitting acceptance paths

`adw_rea_plan.py` runs real REA collection -> typed interpretation -> planning
and ends before any build or commit. The model has no tools; the engine renders
identical validated handoff copies and preserves immutable raw evidence.

`adw_verify_sdlc.py` uses the normal SDLC test/review/repair/documentation logic,
omitting its three commit phases. Normal full-build workflows retain their
commit behavior. Both alternatives require their own workflow-specific approval.

`studio/scripts/acceptance.ts prepare` creates a private isolated target from
existing Git history, synthetic inputs, saved router profiles, project checks,
and concrete reviewable specs. It creates no new commit or approval. The `run`
command requires a recorded approval ID and verified-free connection assertion.
The isolated target has a pre-commit hook rejecting accidental commits.

## Verification boundary

Automated regression, actual browser checks, real CLI runs and live model
acceptance are tracked separately in HANDOFF.md. Earlier handoff records contain
three usable generated apps but also failed phase/budget records; those failures
must not be presented as successful complete SDLC runs.

Current live acceptance is being performed on the owner-approved synthetic
specifications in `.sssf/acceptance/product-20261021/requests/`. Failed attempts
and diagnostics are preserved. Consult the latest HANDOFF.md section for final
results and exact remaining blockers. No public release is authorized.
