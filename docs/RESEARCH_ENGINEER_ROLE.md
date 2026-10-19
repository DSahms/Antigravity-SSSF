# Research Engineer (future role) — interface design, not built

**Status:** design only. Do NOT install REA or build this capability today.

## Purpose

A software-specific investigator: studies useful features or legacy workflows,
returns evidence plus adaptation proposals, and optionally produces an original
prototype. It feeds the existing factory — it never bypasses review or approval.

## Contract

- **Input:** a research question + scope (files, docs, or a legacy workflow) recorded like any job intake.
- **Output:** an evidence pack (what exists, where, with source references) and an adaptation proposal (what to change, which requirement it serves, conflicts with which ADR).
- **Optional prototype:** clearly marked throwaway, built under a case directory, never merged without the normal Intake → Lock → Build → Verify path.
- **Disposition:** every proposal lands in review with accept / revise / dismiss, reasons recorded — the same gate as F2/F3 adversarial findings.

## Extension point in this architecture

- New roster entry in `adws/adw_sssf_config/sssf.config.yaml` (name `researcher`, read-oriented tools: `read`, `grep`, `find`, `ls`, `bash` for running existing code, `write` scoped to the case directory; `writes: ["research/"]`).
- New prompt pair `adws/adw_data/prompt_engineering/researcher/{system,user}.md`, following the scout's read-only pattern with an added evidence-pack envelope type.
- New workflow script (e.g. `adws/adw_research.py`: request → research → review) reusing `agents.execute`, gates, and `ApprovalBook`. No new orchestrator.
- The role already has a reserved Settings slot (`Researcher local/cloud` appears in the roster UI); wiring it is config + prompts, not framework work.

## Why not now

The first release needs the core journey solid. Research output without review
discipline becomes a findings firehose (see F3). Revisit after planner costs
are bounded and the review queue has dismissal mechanics.
