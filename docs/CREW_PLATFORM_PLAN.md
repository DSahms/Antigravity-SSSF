# Crew Platform — foundation and delivery plan

Date: October 14, 2026

## Product intent

Crew Platform turns a conversation and supporting materials into a reviewed, useful result. A capable interviewer draws out goals, tacit knowledge, constraints, and missing details. The user reviews a plain-language brief and confirms execution separately. Python coordinates selected specialists, verifies their outputs, manages bounded corrections, and records evidence. Software development is the first job type; the shared engine must also support information work without requiring a source-code repository.

Crew Technologies is the umbrella identity. Crew Platform is this product. Preserve upstream attribution and license obligations while migrating active product names and storage references without losing saved settings.

## Current evidence and limitations

The local checkout points to DSahms/Antigravity-SSSF and is on flow-and-onboarding. The public GitHub page could not be retrieved during this review; conclusions are about the local checkout, not a verified remote comparison.

Existing assets include the Python workflow engine, Vue interface, saved connection profiles, roster presets, approvals, and SQLite tracing. Previous checks passed type checking and frontend build when invoked directly. This review did not repeat those checks or execute provider calls.

Outstanding gaps: rule-based rather than model-driven intake; profiles disconnected from workflow execution; audit findings in approval isolation, change detection, API access, token reporting, process termination, and Windows pause; placeholder quality commands; incomplete branding and manuals. Existing foundation progress documents record planning rather than completed implementation. jobtypes/software.yaml currently contains an agent roster rather than a job definition, and references prompt paths that must be validated before use. demo-case is sample data, not proof of a working non-software job.

## Foundation boundaries

- Case: durable job identity, user brief, attachments, answers, evidence, approvals, drafts, outputs, and run history. A software case can link to a Git repository; other cases need no Git.
- Connection: saved provider endpoint, credential reference, discovered or configured models, capabilities, and connection-test result. Do not require separate credential entry per role. Support configured compatible endpoints and dummy keys where accepted; auto is provider-dependent.
- Roster: reusable role-to-connection/model choices, optional roles, and cost preferences. It is not the workflow.
- Job definition: ordered steps and dependencies, required roles, input/output contracts, completion checks, tools, and review checkpoints. Reject incompatible roster/job combinations before starting.
- Domain pack: versioned questions, terminology, checklists, templates, and source requirements. Keep jurisdiction and funder rules out of the shared core.
- Python coordinator: explicit state transitions, structured handoffs, validation, bounded retries, cancellation, budgets, and resumable records. Model responses are proposals rather than authority to bypass these controls.

Use structured fields to support optional future scheduling and outside review. Do not build empty vertical screens, a generalized plugin framework, or recurring-job infrastructure before a real use case needs them.

## Interview and approval behavior

Ask one useful question at a time with optional explanation and suggested answers. Allow speech, paste, upload, skip, corrections, and resume. Capture user-stated accessibility needs and preferences with consent; do not infer diagnoses or sensitive facts as settled information.

Distinguish required facts, optional improvements, assumptions, and unresolved questions. Offer practical alternatives when something is missing. The model may recommend readiness, but code checks the job's required fields and contradictions. Permit an explicitly scoped partial result where appropriate instead of pretending missing facts are known.

First confirmation: approve the understood brief. Second confirmation: authorize the displayed workflow, roster, data destinations, and budget. Both use buttons, never typed phrases. Bind execution to that exact brief and execution configuration; meaningful changes require renewed authorization. Autosave protects unfinished input before either approval.

## Delivery sequence

### 1. Preserve and stabilize

Back up saved profiles and settings without exposing credentials. Record the baseline and preserve existing uncommitted work. Repair all audit findings, validate workflow paths and inputs, isolate project/case state, prevent secrets from appearing in routine API responses, and replace placeholder checks. Keep personal-use startup simple through loopback binding and automatic access protections. Stop must terminate descendants and retain stopped status. Disable Windows Pause with a clear explanation until actual suspension or safe checkpoint pausing exists. Budgets must use real usage events, account for reporting delay, and never promise an exact monetary ceiling from token estimates alone.

Acceptance: restart preserves settings; changing cases cannot reuse another case's approvals; unauthorized edits are detected; stopping leaves no child agents working; failed checks cannot report a successful product.

### 2. Establish shared cases and connections

Introduce the case and job contracts with a software adapter over the existing Python workflows. Migrate existing connections once and connect UI selections to actual runtime configuration. Preserve named rosters. Provide endpoint presets, paste-and-trim credentials, model selectors, apply-to-selected-roles, test connection, autosave, and clear saved status. Store credentials outside tracked files. Support one-click Windows startup with actionable dependency checks.

Acceptance: selected models and endpoints are demonstrably used by the selected agents; software and research cases can coexist; a research job does not require Git or invoke a coding step.

### 3. Deliver the real interviewer and software path

Use the user's selected frontier model for intake. Pass an approved structured brief into planner, builder, deterministic checks, reviewer, and documentation steps. Optional specialists are added only when the job requires them. The approved roster remains visible. Bound repair rounds; show a useful partial result and remaining blockers when exhausted. Isolate software runs from unrelated operator work and require explicit authorization for publishing or deployment.

Acceptance: run one small real software job from intake through both confirmations to a launchable demo, passing checks, review findings, and documented limitations. Also exercise failure, interruption, restart, and cancellation. No paid acceptance run until a connection and budget have been chosen.

### 4. Prove a non-software path

Deliver research briefs using interview, research, scrutiny, and report roles. Persist original sources, retrieval dates, citations attached to claims, conflicting evidence, and unanswered questions. Review citation support rather than merely whether links exist.

Acceptance: one actual sourced research brief is produced in a case with no Git repository and no builder. Its evidence is inspectable and unsupported claims are identified.

### 5. First domain expansion: grants and reentry resources

Limit the first pilot to one organization and a small set of actual funding opportunities. Distinguish organization grant applications from an individual's benefits/resource eligibility. Capture funder rules and deadlines with source dates. Gather only necessary personal information, support redaction, explain provider destinations, and define retention/export/delete behavior. Interview gently, identify gaps, suggest truthful ways to address them, draft, and check against the funder's rubric. Do not fabricate qualifications, outcomes, or personal histories. An authorized person reviews submissions; no automatic external submission.

Acceptance: a reviewer can trace application claims to supplied facts and requirements to current funder sources. Missing information and deadlines remain visible.

### 6. Later domain expansion: permit preparation

Start with one jurisdiction and one project category. Produce a preparation packet and guidance, not an official permit or structural certification. Record authoritative rules and their versions, supplied measurements, assumptions, and professional-review requirements. Treat photos as aids rather than dependable measurements. Calculate quantities and estimates in code from confirmed inputs and dated prices; show uncertainty and exclusions. Suggest alternatives with traceable reasoning. Verify that recommended changes really address the cited requirement before presenting them as solutions.

Acceptance: outputs separate confirmed facts, estimates, missing evidence, and issues requiring the authority or a qualified professional. No claim that a prior estimate's accuracy guarantees future estimates.

## Accessibility and documentation are delivery requirements

Mouse-only completion of every essential flow; sufficiently large targets; no drag-only, hover-only, or keyboard-shortcut-only requirements. Preserve keyboard and assistive-technology access too. Remember choices, avoid repeated entry, expose paste/copy buttons, allow dictated corrections, autosave drafts, and show errors beside the setting that needs attention. Keep one primary action per stage and advanced controls optional.

Produce polished HTML User's and Learner's Manuals using the supplied master prompts. User documentation covers operating the actual finished distribution; learner documentation covers source setup, architecture, short lessons, Mermaid diagrams, checkpoints, walkthroughs, and maintenance. Document only verified behavior. codebase-to-course and walkthrough were not available in this session; locate them before claiming their mandated use, or explicitly agree on an equivalent implementation. Validate search, links, responsive layouts, focus states, contrast, and application regressions. Manuals evolve with each delivered milestone and are part of completion rather than a last-minute add-on.

## Scope and working agreement

One active implementation in this repository. No deletion or archival of unrelated repositories as part of this plan. No automatic public deployment, external application submission, or unbounded provider spending. First target: a reliable personal software-building workflow and a real research proof over the same foundation. Grants come next; permits follow after domain-specific validation. Other verticals remain design examples rather than promised implementations.
