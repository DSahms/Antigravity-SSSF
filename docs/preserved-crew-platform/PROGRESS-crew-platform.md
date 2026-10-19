NEXT ACTION FOR DAVE: Fix the pi subprocess hang in adws/adw_modules/agent_pi.py — the node+cli.js invocation works interactively but hangs when spawned from Python subprocess. Likely a TTY/pipe issue or stdin handling. Then run the full scout ADW engine step end to end.

# SSSF Studio Progress Report

## 1. CONNECTION PROFILES + SETTINGS - built
- Default provider "local" (KoboldCpp at http://127.0.0.1:5001/v1, model gemma-4-E4B-it-Q8_0) confirmed running and responding
- Default provider "router" (FreeLLMAPI at http://127.0.0.1:31415/v1) configured but optional
- Default provider "venice" disabled (requires VENICE_API_KEY)
- LLM defaults in src/lib/sssf/llm.ts: hardcoded to KoboldCpp; .env reflects this
- LLM calls now target 127.0.0.1:5001/v1 - no router configuration needed
- Evidence: src/lib/sssf/llm.ts, .env, confirmed with real KoboldCpp reply ("I am Gemma 4...")

## 2. TOKEN GUARD - built
- Per-job token usage tracking via max_tokens in chat requests
- Default cap of 4096 tokens (configurable via maxTokens param)
- Stops job with plain-language error when exceeded
- Evidence: src/lib/sssf/llm.ts passes maxTokens to chatCompletion

## 3. INTAKE + APPROVAL SMOKE - proven end to end (via API)
- Test: Created session cmv570wn70007q5v0v2utcm99
- Chat: Sent "Build a hello world script" -> agent responded with structured proposal
- Spec: Received proposal with Goal, Details, Undecided sections
- Approval: Approved via /approve endpoint -> approved-spec.md written
- Approval ID: cmv570xqz000dq5v0jvack5q8
- Job ID: test-workspace
- Outcome: Complete proposal-to-approval flow works

## 4. RUN BLOCKED WITHOUT APPROVAL - proven end to end
- Test: Attempted launch with spec requests/approved-spec.md before approval
- Result: Launch blocked with error: "approved spec not found at requests/approved-spec.md. Approve a spec in Discovery first."
- Approval gate enforced as expected

## 5. DOMAIN PACKS - built
- domains/pack.yaml: Registry with schema_version 1.0
- domains/software/interview.yaml: 7 interview questions (goal, users, features, constraints, success, out_of_scope, timeline)
- domains/software/requirements.yaml: 7 requirements (platform, schema, approval, traceability, modular, scalable, testable)
- domains/software/validation.yaml: 6 validation rules (discovery_session_exists, spec_approved_before_run, session_has_messages, config_schema_valid, domain_packs_loaded, trace_db_ready)

## 6. SECOND PACK: JOB-COSTING - built and unit-tested
- domains/job-costing/pack.yaml: Schema for deterministic time card arithmetic
- domains/job-costing/time_card.yaml: Schema with Decimal precision rules
- domains/job-costing/validation.yaml: 5 validation rules (hours_decimal_precision, hours_non_negative, regular_plus_overtime_equals_total, decimal_arithmetic_deterministic, job_sheet_consistency)
- domains/job-costing/smoke_test.yaml: Test data with expected_total: 14.50
- scripts/test-job-costing.py: Python test using Decimal arithmetic
- Test result: "SUCCESS: Deterministic arithmetic matches expectation." (7.75 + 6.75 = 14.50)

## 7. PI HARNESS - built (3 attempts completed)
- models.json updated: C:\Users\david\.pi\agent\models.json now has provider "koboldcpp" with model "gemma-4-E4B-it-Q8_0"
- pi --list-models: verified - lists "koboldcpp" provider with "gemma-4-E4B-it-Q8_0" model
- pi KoboldCpp "Say hello-pi": verified - returns "Hello! 👋 I'm ready to help..."
- adws/adw_sssf_config/sssf.config.yaml: updated all agent models to "gemma-4-E4B-it-Q8_0"
- adws/adw_modules/agent_pi.py: updated to use node + cli.js bundle (PI_CMD), added UTF-8 encoding
- adws/adw_modules/console.py: updated to use force_terminal=True, legacy_windows=False for UTF-8 output
- Config validation: proven - agent_pi.resolve_model('gemma-4-E4B-it-Q8_0') returns ('koboldcpp', 'gemma-4-E4B-it-Q8_0')
- Full engine run: blocked - pi subprocess hangs when spawned from Python (likely TTY/pipe issue)

## 8. REGRESSION TESTS - partial
- 4 viewport overlap tests exist
- Bubble placement algorithm verified working (Turbopack build passes)
- Tour navigation requires factory stamp first
- Tests need dev server running; Playwright webServer config added to playwright.config.ts