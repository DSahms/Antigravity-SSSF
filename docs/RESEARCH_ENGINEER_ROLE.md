# REA integration — current implementation

REA is an optional investigation stage inside the approved Build workflow.
Intake -> Lock -> Build -> Verify and ApprovalBook enforcement remain intact.
Everything in this recovery is uncommitted working-tree work.

The engine invokes pinned `npx -y rea-agents@6.7.0
analyze-javascript-application <target> --json` before any interpretation agent.
This static analyzer reads inert JavaScript artifacts without executing them.
Only local JavaScript directories and ASAR are enabled. Native, managed,
database, model, device, remote and runtime investigations are not enabled by
this integration. No MCP registration, global configuration or paid provider
is needed for collection.

The approved specification must contain exactly one block:

```crew-rea
{"question":"Which module handles normalization?","target":"D:/owned/synthetic-app","scope":"Static inventory of the entire selected directory only","permitted_actions":"static-local"}
```

Choose the narrowest target tree authorized for inspection. The scope covers
that tree; the engine does not interpret prose as a file-selection language.
The interpreter must preserve all four approved strings. Studio loads the
assignment from the exact approved spec, not launch-request overrides or model
output. Invalid/missing assignments fail before collection or agent execution.
Direct Python use remains an operator-facing engine entry point; ApprovalBook
is enforced by Studio, as with existing workflows.

`rea_collect` persists complete raw JSON in the run's context_handoff directory.
It will not overwrite an existing evidence file. Errors persist sanitized
command/exit/diagnostic details in rea_diagnostic.json; failure never becomes a
finding. Environment fixtures cannot bypass real collection.

The `rea` agent interprets an engine-generated evidence projection without
tools. The engine writes rea_handoff.md and an identical specs copy after
validating its typed interpretation. Gates require approved assignment identity, evidence-backed facts
and inferences, explicit unknowns/limitations, behavioral requirements,
validation cases, both handoff copies and unchanged raw evidence. Existing
write permissions still check agent modifications; the REA interpreter and
evidence planner have no filesystem or shell tools.

The tool-free evidence planner receives the validated ReaOutput and returns typed plan text. The engine persists both plan copies and validates source citations. The planner must use the handoff,
requirements, cases and limitations. Plan Only describes an investigation and
never runs collection or REA; ordinary workflows are unchanged. Full SDLC
normally commits its plan, build and documentation only at the existing gated
stages. This recovery did not run that live committing workflow.

Real REA 6.7.0 verification succeeded on adws/adw_data/rea_synthetic: two
modules, zero endpoints and thirteen explicitly reported unknowns. Raw evidence
is in adws/adw_data/rea_verification/pinned. A real intentionally missing ASAR
returned exit 1 and structured input_path ENOENT; both streams are retained in
rea_verification/failure-complete. These checks use no model/provider calls.
Agent interpretation and planner consumption have separate mocked regression
coverage; a live model SDLC run is still unverified. See HANDOFF.md for exact
checks, diagnostics, limits and the earlier session's unresolved request error.
