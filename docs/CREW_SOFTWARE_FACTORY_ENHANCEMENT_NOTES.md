# CREW Software Factory — Enhancement Research Notes

**Date:** October 15, 2026  
**Status:** Saved for later evaluation; no implementation decisions made

## Scope and distinction

These findings come primarily from David Ondrej's discussion of **agentic loops and software-factory operations**, not from the Cloudroom product. **CREW is not being replaced with Cloudroom.** The aim is to examine ideas that could improve the existing CREW architecture without creating a dependency on Cloudroom's hosted service or its future pricing.

CREW's established workflow remains **Intake → Lock → Build → Verify**. The ideas below are candidates to evaluate against the actual codebase, **not confirmed missing features**.

## Candidate improvements

### F1 — Autonomous work discovery
Allow agents to inspect repositories, requirements, test results and approved architectural decisions on a schedule or after relevant events. They identify worthwhile unfinished work and prepare a proposal for the existing CREW intake/approval process. Discovery alone does not authorize implementation.

### F2 — Adversarial cross-model review
Have one agent propose a change or identify a problem, and a second independent model challenge whether the proposal is valid, necessary and consistent with the project. Only findings that survive review should be escalated for a decision.

### F3 — Automatic triage and dismissal
Allow review loops to close or archive low-value, duplicate or unsupported findings while retaining an auditable record of the reasoning and evidence. Surface meaningful exceptions instead of accumulating an endless queue.

### F4 — Architecture decisions as active constraints
Use existing project requirements, architecture decision records (ADRs) and scope decisions as explicit criteria for evaluating potential work. Proposed improvements should indicate which approved requirements they serve and whether they conflict with earlier decisions.

### F5 — Event-driven and scheduled specialist loops
Allow appropriate workflows to begin from defined triggers: failed tests, new issues, repository changes, bug reports, requirement changes, scheduled checks and similar events. Keep the execution and authorization boundaries of CREW intact.

### F6 — Reusable skill sequences
Review recurring agent traces to discover procedures that consistently occur together. Propose reusable chains of skills or workflow templates, rather than relying only on one-off prompts. This is a proposed direction discussed in the video, not a verified finished Cloudroom feature.

### F7 — Outcome-based evaluations and resource allocation
Track meaningful outcomes: correct completed jobs, rejected unnecessary work, required human interventions, elapsed time and inference expenditure. Prefer these measures over agent counts, generated code volume or number of active threads.

## Distinctive operational ideas from the video

- **Find work before starting work:** dedicated discovery agents look for consequential gaps.
- **Challenge the necessity of a change:** review should ask *should this be done?*, not only *is this code correct?*
- **Close uneventful loops automatically:** only exceptional or valuable findings demand attention.
- **Separate detection from authority:** autonomous monitoring can operate continuously while CREW retains job approval and execution gates.
- **Organize specialist loops by responsibility:** code health, dependency reviews, test gaps, architecture drift, product feedback and similar areas, as relevant to each project.

## Priority for later discussion

1. **F1 — Autonomous discovery and triage**
2. **F2 + F3 — Independent challenge and automatic dismissal**
3. **F5 — Event-triggered continuous workflows**

F4 should underpin these capabilities; F6 and F7 can be assessed alongside them.

## Cloudroom's limited relevance

Cloudroom illustrates infrastructure patterns (agent sessions, multi-harness execution, remote sandboxes, persistent histories, agent-control APIs), but **none of the candidate factory improvements requires adopting Cloudroom**. Its hosted free plan and future pricing should not become an architectural dependency for CREW. Open-source implementation ideas may be studied separately if useful.

## Questions for the later CREW audit

1. Which F1–F7 capabilities already exist, fully or partially?
2. What are the actual gaps in the current CREW Foundation and related factory components?
3. Where should discovery, review and continuous loops attach to Intake → Lock → Build → Verify?
4. How will rejected findings, approvals, and evaluation metrics be recorded?
5. Which changes, if any, merit implementation now versus remaining on the research backlog?

## Research references

- Video transcripts discussed October 15, 2026: David Ondrej on Cloudroom and on agentic loops/software factories.
- [Cloudroom website](https://www.cloudroom.dev/)
- [Cloudroom core source](https://github.com/davidondrej/cloudroom-core)

**Bottom line:** The most promising addition to CREW is a controlled layer that proactively identifies possible work, independently challenges it, dismisses noise and submits only meaningful proposals to the existing factory. This is a research direction, not a commitment to implement it.
