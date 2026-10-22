"""Config loading/validation and agent execution.

Every ADW validates its agents before running (fail fast, nothing spawns
against a half-valid config). Every agent call parses against a concrete
output type; parse failures and gate violations re-prompt the SAME session
with a correction — context intact, bounded retries. Agent proposes, code
disposes.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import yaml

from . import agent_pi, permissions, prompts
from .data_types import (AgentCall, AgentConfig, EnvelopeBase, EventRecord,
                         GateCheck, GateReport, Phase, PiRequest, SSSFConfig,
                         UsageBreakdown)
from .utils import new_id

JSON_FIX_ATTEMPTS = 2      # continue-with-correction attempts for malformed JSON


class GateFailure(RuntimeError):
    pass


class TokenBudgetExceeded(RuntimeError):
    """An agent burned past its roster-configured spend ceiling mid-turn.

    Raised inside the event callback, where agent_pi.run kills the coding-agent
    child and propagates — so the phase fails cleanly with a plain message
    instead of running to the outer run cap."""


# ── config ───────────────────────────────────────────────────────────────────

def load_config(path: str = "adws/adw_sssf_config/sssf.config.yaml") -> SSSFConfig:
    raw = yaml.safe_load(Path(path).read_text()) or {}
    defaults = raw.get("defaults", {}) or {}
    for agent in raw.get("agents", []) or []:
        for key in ("coding_agent", "model", "thinking", "color", "tools", "writes", "max_tokens",
                    "harness_engineering"):
            if key in defaults:
                agent.setdefault(key, defaults[key])
        agent.setdefault("harness_engineering", defaults.get("harness_engineering", []))
    return SSSFConfig(**raw)


def resolve(cfg: SSSFConfig, name: str) -> AgentConfig:
    for agent in cfg.agents:
        if agent.name == name:
            return agent
    raise SystemExit(f"agent {name!r} is not defined in the config — "
                     f"available: {[a.name for a in cfg.agents]}")


def validate(cfg: SSSFConfig, required: list[str]) -> None:
    """Fail fast: every required name must resolve to a usable agent."""
    problems = []
    for name in required:
        try:
            agent = resolve(cfg, name)
        except SystemExit as e:
            problems.append(str(e))
            continue
        if agent.coding_agent != "pi":
            problems.append(f"agent {name!r}: coding_agent {agent.coding_agent!r} "
                            f"is not implemented in v1 (pi only)")
        for label, ref in (("system", agent.prompt_engineering.system),
                           ("user", agent.prompt_engineering.user)):
            if not Path(ref).is_file():
                problems.append(f"agent {name!r}: {label} prompt not found: {ref}")
        try:
            agent_pi.resolve_model(agent.model)
        except ValueError as e:
            problems.append(f"agent {name!r}: {e}")
    if problems:
        raise SystemExit("config validation failed:\n- " + "\n- ".join(problems))


# ── execution ────────────────────────────────────────────────────────────────

def execute(run, phase: Phase, call: AgentCall) -> EnvelopeBase:
    """One agent call: render prompts -> pi run -> typed parse -> gates -> envelope."""
    agent = resolve(run.cfg, phase.params.owner)
    agent_dir = run.session_dir / agent.name
    agent_dir.mkdir(parents=True, exist_ok=True)

    variables = {
        "prompt": call.prompt,
        "previous_envelope": call.previous.model_dump_json(indent=2) if call.previous else "(none)",
        "context_handoff_dir": str(run.context_handoff_dir),
    }
    system_text = prompts.render(agent.prompt_engineering.system, variables)
    user_text = prompts.render(agent.prompt_engineering.user, variables)
    prompts.save(agent_dir / "prompts", "system.md", system_text)
    prompts.save(agent_dir / "prompts", "user.md", user_text)

    session_id = _agent_session_id(run, agent)
    run.tracer.event(EventRecord(adw_id=run.adw_id, phase_id=phase.phase_id,
                                 type="agent_start", name=agent.name,
                                 payload={"model": agent.model, "thinking": agent.thinking,
                                          "color": agent.color,
                                          "session_id": session_id,
                                          "coding_agent": agent.coding_agent,
                                          "purpose": agent.purpose,
                                          "tools": agent.tools,  # None = all tools
                                          "harness_engineering": agent.harness_engineering}))
    run.console.agent_started(agent.name, agent.model, session_id)

    # Parse retries and gate corrections re-enter the SAME pi session, so the
    # last send is the one whose context occupancy is current — while spend is
    # the opposite: every send costs, so usage accumulates across all of them.
    latest: agent_pi.PiResult | None = None
    spent = UsageBreakdown()

    def send(prompt_text: str) -> agent_pi.PiResult:
        nonlocal latest
        request = PiRequest(
            prompt=prompt_text,
            system_prompt=system_text,
            model=agent.model,
            thinking=agent.thinking,
            session_id=session_id,
            # absolute: these are read by the pi subprocess, which runs in repo_root
            session_dir=str((agent_dir / "pi_sessions").resolve()),
            raw_output_path=str((agent_dir / "raw_output.jsonl").resolve()),
            tools=agent.tools,
            extensions=agent.harness_engineering,
            cwd=str(run.repo_root),
        )
        forwarder = _event_forwarder(run, phase, agent.name)
        track_budget = _budget_tracker(agent.name, agent.max_tokens)
        def observe(event: dict) -> None:
            forwarder(event)
            if event.get("type") == "message_end" and event.get("message", {}).get("role") == "assistant":
                run.check_token_cap()
                # Engine-owned spend ceiling: trips mid-turn, kills the child
                # via agent_pi's BaseException path, fails the phase cleanly.
                track_budget(event["message"].get("usage", {}) or {})
            if event.get("type") == "tool_execution_end":
                permissions.enforce(run, phase, agent, tree_before, recover=planner_recover)
        try:
            result = agent_pi.run(
                request,
                on_event=observe,
                on_spawn=lambda pid: run.tracer.process_start(
                    run.adw_id, "agent", agent.name, pid,
                    f"{agent.coding_agent} {agent.name} {agent.model}"),
                on_exit=lambda pid: run.tracer.process_end(run.adw_id, pid))
        finally:
            permissions.enforce(run, phase, agent, tree_before, recover=planner_recover)
        run.add_usage(result.tokens, result.cost)
        spent.merge(result.usage)
        latest = result
        return result

    # What the tree looked like before this agent got its hands on it. Every
    # send in this phase — first prompt, JSON retries, gate corrections — is
    # measured against this one baseline.
    tree_before = permissions.snapshot(run)

    # Bounded backstop for the planner's one known path improvisation: the
    # engine owns the plan destination (see _misplaced_plan_recoverer). Every
    # other agent, and every other path, enforces exactly as before.
    planner_recover = _misplaced_plan_recoverer(run, phase, agent)

    result = send(user_text)
    envelope, attempt = _parse_with_retries(run, phase, call, result, send)

    # claim gates — violations flow back into the SAME session as corrections
    for gate_attempt in range(1, max(1, phase.params.retries + 1) + 1):
        violations = []
        for gate in call.gates:
            report = _as_report(gate(envelope, run))
            found = report.violations
            run.tracer.gate_row(phase, gate.__name__, report, gate_attempt)
            run.tracer.event(EventRecord(
                adw_id=run.adw_id, phase_id=phase.phase_id,
                type="gate_fail" if found else "gate_pass", name=gate.__name__,
                payload={"attempt": gate_attempt, "violations": found,
                         "checks": [c.model_dump() for c in report.checks]}))
            run.console.gate_result(gate.__name__, report)
            violations.extend(found)
        if not violations:
            break
        if gate_attempt > phase.params.retries:
            raise GateFailure(f"{agent.name} failed gates after {gate_attempt} attempt(s):\n- "
                              + "\n- ".join(violations))
        phase.attempt = gate_attempt
        run.console.retry(agent.name, gate_attempt, phase.params.retries,
                          f"{len(violations)} gate violation(s)")
        correction = ("Your previous response failed validation:\n- "
                      + "\n- ".join(violations)
                      + "\n\nFix these problems, then re-emit ONLY your Report JSON.")
        result = send(correction)
        envelope, attempt = _parse_with_retries(run, phase, call, result, send)

    # Permission is checked after every send is done, and before the envelope is
    # accepted: an agent does not get to report success on a phase in which it
    # wrote somewhere it was not allowed to.
    try:
        touched = permissions.enforce(run, phase, agent, tree_before, recover=planner_recover)
    except permissions.PermissionBreach as breach:
        run.tracer.event(EventRecord(adw_id=run.adw_id, phase_id=phase.phase_id,
                                     type="error", name="permission_breach",
                                     payload={"agent": agent.name, "error": str(breach),
                                              "writes": agent.writes,
                                              "protected_files": run.cfg.defaults.protected_files}))
        raise
    if touched:
        run.tracer.event(EventRecord(adw_id=run.adw_id, phase_id=phase.phase_id,
                                     type="log", name="paths_touched",
                                     payload={"agent": agent.name, "paths": touched}))

    _persist_envelope(run, phase, agent.name, call, envelope, attempt, valid=True)
    run.console.envelope_summary(envelope)
    context = latest or result
    run.tracer.agent_session_row(run.adw_id, agent, session_id,
                                 context_tokens=context.context_tokens,
                                 context_window=context.context_window)
    run.save_agent_map(agent.name, {"session_id": session_id, "model": agent.model,
                                    "coding_agent": agent.coding_agent})
    run.tracer.event(EventRecord(adw_id=run.adw_id, phase_id=phase.phase_id,
                                 type="handoff", name=agent.name,
                                 payload={"artifacts": envelope.artifacts,
                                          "summary": envelope.summary}))
    run.tracer.event(EventRecord(adw_id=run.adw_id, phase_id=phase.phase_id,
                                 type="agent_end", name=agent.name,
                                 # Phase totals, not the last send's: a retried
                                 # phase paid for every attempt.
                                 tokens=spent.total_tokens,
                                 payload={"cost": spent.total_cost,
                                          "usage": spent.model_dump(),
                                          "context_tokens": context.context_tokens,
                                          "context_window": context.context_window}))
    run.console.agent_finished(agent.name, spent.total_tokens, spent.total_cost)
    if envelope.status != "success":
        raise RuntimeError(f"{agent.name} reported status={envelope.status!r}: {envelope.summary}")
    return envelope


# ── internals ────────────────────────────────────────────────────────────────

def _as_report(result) -> GateReport:
    """Accept a GateReport, or a legacy gate that returned a violations list."""
    if isinstance(result, GateReport):
        return result
    return GateReport(checks=[GateCheck(item=str(v), ok=False) for v in (result or [])])


def _budget_tracker(agent_name: str, limit: Optional[int]):
    """Per-turn spend meter for one agent call. Returns an observer to feed
    each assistant message's usage dict; raises TokenBudgetExceeded past the
    ceiling. A None limit observes nothing (outer run cap still applies)."""
    spent = 0

    def observe_turn(usage: dict) -> None:
        nonlocal spent
        if limit is None:
            return
        spent += agent_pi._context_tokens(usage or {})
        if spent >= limit:
            raise TokenBudgetExceeded(
                f"{agent_name} exceeded its {limit:,}-token budget "
                f"({spent:,} used). Narrow the task or raise max_tokens for "
                f"{agent_name} in adws/adw_sssf_config/sssf.config.yaml.")

    return observe_turn


def _agent_session_id(run, agent: AgentConfig) -> str:
    entry = run.agent_map.get(agent.name)
    if entry and entry.get("model") == agent.model:
        return entry["session_id"]           # rejoin the existing context window
    return f"sssf-{run.adw_id}-{agent.name}-{new_id(4)}"


# Parent directory names the planner has used instead of the engine-owned
# `context_handoff/` when writing plan.md — observed in real runs, not guessed.
_PLAN_RECOVERY_PARENTS = frozenset({"context_handoff", "context_handoff_dir"})


def _misplaced_plan_recoverer(run, phase, agent):
    """Relocate a misplaced plan.md to the engine-owned destination.

    The planner must write exactly one artifact outside `specs/`: the plan at
    `<context_handoff_dir>/plan.md`. The small local model intermittently
    writes it to a lookalike path instead (`context_handoff/plan.md` at the
    repo root, `sessions/<adw>/context_handoff/plan.md`, or a literal
    `context_handoff_dir/plan.md`). The content is right; only the location is
    wrong — failing the whole phase over that wastes a 40k-token plan.

    This recovers at most ONE non-empty plan.md per phase, only for the
    planner, only into the engine-owned destination, and never clobbers an
    existing plan with different content. The relocation is recorded as a
    `recovery` trace event and a console note, so it is auditable. Anything
    else — other agents, other files, conflicting content — enforces and rolls
    back exactly as before.
    """
    if agent.name != "planner":
        return None
    expected = Path(run.repo_root) / run.context_handoff_dir / "plan.md"

    def recover(breach_paths: list[str]) -> list[str]:
        recovered = []
        for rel in breach_paths:
            if recovered:
                break                              # bounded: one artifact
            src = Path(run.repo_root) / rel
            if src.name != "plan.md" or src.parent.name not in _PLAN_RECOVERY_PARENTS:
                continue
            try:
                content = src.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if not content.strip():
                continue                           # empty file: let the breach stand
            if expected.exists():
                try:
                    same = expected.read_text(encoding="utf-8", errors="replace") == content
                except OSError:
                    continue
                if not same:
                    continue                       # never clobber a real plan
            else:
                expected.parent.mkdir(parents=True, exist_ok=True)
                expected.write_text(content, encoding="utf-8", errors="replace")
            try:
                src.unlink()
                parent = src.parent
                root = Path(run.repo_root).resolve()
                while parent.resolve() != root and parent.name in _PLAN_RECOVERY_PARENTS | {"sessions", run.adw_id}:
                    try:
                        parent.rmdir()             # only empty dirs go
                    except OSError:
                        break
                    parent = parent.parent
            except OSError:
                continue
            recovered.append(rel)
            payload = {"from": rel, "to": str(Path(run.context_handoff_dir) / "plan.md"),
                       "reason": "misplaced plan.md relocated to the engine-owned destination"}
            tracer = getattr(run, "tracer", None)
            if tracer is not None:
                try:
                    from .data_types import EventRecord
                    tracer.event(EventRecord(adw_id=run.adw_id, phase_id=phase.phase_id,
                                             type="recovery", name=agent.name, payload=payload))
                except Exception:
                    pass
            console = getattr(run, "console", None)
            if console is not None:
                try:
                    console.note(f"recovery: moved misplaced {rel} to the plan destination")
                except Exception:
                    pass
        return recovered

    return recover


def _event_forwarder(run, phase: Phase, agent_name: str):
    """One tool_call event per real tool call, with its exact args and result."""
    tracker = agent_pi.ToolCallTracker()

    def forward(event: dict) -> None:
        if event.get("type") == "message_end" and event.get("message", {}).get("role") == "assistant":
            tokens = agent_pi._context_tokens(event["message"].get("usage", {}) or {})
            run.tracer.event(EventRecord(adw_id=run.adw_id, phase_id=phase.phase_id,
                                         type="usage", name=agent_name, tokens=tokens,
                                         payload={"agent": agent_name}))
        record = tracker.observe(event)
        if record is None:
            return
        # The call's span rides the columns; duration_ms stays in the payload as
        # pi's own authoritative number.
        run.tracer.event(EventRecord(adw_id=run.adw_id, phase_id=phase.phase_id,
                                     type="tool_call", name=record.pop("label"),
                                     started_at=record.pop("started_at", None),
                                     ended_at=record.pop("ended_at", None),
                                     payload={**record, "agent": agent_name}))
    return forward


def _extract_json(text: str) -> dict:
    candidate = text
    if "```" in text:
        for block in text.split("```")[1::2]:
            block = block.removeprefix("json").strip()
            if block.startswith("{"):
                candidate = block
                break
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object found in the response")
    return json.loads(candidate[start:end + 1])


def _parse_with_retries(run, phase: Phase, call: AgentCall, result, send):
    """Parse the final response against the declared output type; on failure,
    continue the SAME session with a correction (bounded)."""
    for attempt in range(1, JSON_FIX_ATTEMPTS + 2):
        try:
            payload = _extract_json(result.text)
            return call.output_type.model_validate(payload), attempt
        except Exception as error:
            _persist_envelope(run, phase, phase.params.owner, call, None, attempt,
                              valid=False, raw=result.text)
            if attempt > JSON_FIX_ATTEMPTS:
                raise RuntimeError(
                    f"{phase.params.owner} never produced valid "
                    f"{call.output_type.__name__} JSON: {error}") from error
            run.console.retry(phase.params.owner, attempt, JSON_FIX_ATTEMPTS,
                              f"invalid {call.output_type.__name__} JSON: {error}")
            fields = ", ".join(call.output_type.model_fields.keys())
            result = send(
                f"Your response was not valid JSON for the required structure "
                f"({error}). Respond again with ONLY a JSON object with these "
                f"fields: {fields}. No prose, no code fences.")


def _persist_envelope(run, phase: Phase, agent_name: str, call: AgentCall,
                      envelope: Optional[EnvelopeBase], attempt: int,
                      valid: bool, raw: str = "") -> None:
    payload_json = envelope.model_dump_json(indent=2) if envelope else json.dumps({"raw": raw[-2000:]})
    run.tracer.envelope_row(phase, agent_name, call.output_type.__name__,
                            payload_json, valid, attempt)
    if envelope:
        record = {"agent_name": agent_name, "purpose": resolve(run.cfg, agent_name).purpose,
                  "output_type": call.output_type.__name__, "attempt": attempt,
                  **envelope.model_dump()}
        (run.session_dir / agent_name / "envelope.json").write_text(json.dumps(record, indent=2), encoding="utf-8", errors="replace")
