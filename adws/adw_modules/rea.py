"""Deterministic REA CLI runner + evidence adapter.

This is the engine-owned half of the REA integration. It invokes the
official REA CLI (morluto/rea), persists the raw JSON evidence, and builds
a structured summary the rea agent consumes as its previous envelope.

No LLM is involved here: this layer either returns real REA output or fails
loudly naming the exact missing piece (no CLI, failing command, unparsable
output, unsupported target). An incomplete investigation can never look like
a successful verified finding because there is no path that fabricates one.
"""

from __future__ import annotations

import json
import hashlib
import os
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path


class ReaError(RuntimeError):
    """Base for all REA collection failures. Never a finding."""


class ReaUnavailable(ReaError):
    """The REA CLI itself is missing (no npx/node, or npx cannot fetch it)."""


class ReaUnsupportedTarget(ReaError):
    """The target needs an engine or provider this factory does not install
    (native binaries, APKs, firmware, devices, runtime observation)."""


class ReaFailed(ReaError):
    """The REA command ran and did not succeed, or its output was unusable."""


# (suffix-tuple, kind, rea-command). Order matters: specific first.
SUPPORTED_TARGETS: tuple[tuple[tuple[str, ...], str, str], ...] = (
    ((".asar",), "javascript", "analyze-javascript-application"),
    ((".dll", ".exe"), "managed", "inspect-managed-artifact"),
    ((".db", ".sqlite", ".sqlite3", ".db-wal", ".db-shm"), "sqlite", "inspect-sqlite-database"),
    ((".gguf", ".safetensors"), "model", "inspect-model-artifact"),
)

# Directories are treated as JavaScript/Electron application trees.
JS_DIR_KIND = "javascript"
JS_DIR_COMMAND = "analyze-javascript-application"


def classify_target(target: str) -> tuple[str, str]:
    """Map a target path to (kind, rea-command).

    Raises ReaUnsupportedTarget for anything needing an engine or provider
    this factory does not install (native binaries, APKs, firmware, devices,
    live URLs, runtime observation). Detection is by path shape only —
    nothing is executed or inspected here.
    """
    p = target.strip()
    if not p:
        raise ReaUnsupportedTarget("no investigation target was assigned")
    low = p.lower()
    if low.startswith(("http://", "https://")):
        raise ReaUnsupportedTarget(
            f"live URL target {p!r}: remote inspection is out of scope; "
            "analyze a local copy of the app or its artifacts instead")
    if low.endswith((".apk", ".aab")):
        raise ReaUnsupportedTarget(
            f"Android package {p!r}: requires headless JADX plus a full JDK, "
            "which this factory does not install")
    if low.endswith((".bin", ".elf", ".o", ".ko", ".fw", ".img")):
        raise ReaUnsupportedTarget(
            f"firmware/native target {p!r}: requires a native analysis engine "
            "(Hopper, Ghidra, or IDA), which this factory does not install")
    for suffixes, kind, command in SUPPORTED_TARGETS:
        if low.endswith(suffixes):
            return kind, command
    # Directories (incl. Windows drive paths and extensionless names) are
    # treated as JS application trees; the CLI itself validates the content.
    if low.endswith(("/", "\\")) or "." not in Path(p).name:
        return JS_DIR_KIND, JS_DIR_COMMAND
    if Path(p).is_dir():
        return JS_DIR_KIND, JS_DIR_COMMAND
    raise ReaUnsupportedTarget(
        f"target {p!r}: no supported REA workflow without an additional engine "
        "(native analysis needs Hopper, Ghidra, or IDA)")


def _npx_prefix() -> list[str]:
    npx = shutil.which("npx")
    if not npx:
        raise ReaUnavailable(
            "npx not found on PATH (Node.js 22+ required): install Node.js "
            "or run where `npx --version` works, then retry")
    return [npx, "-y", "rea-agents@6.7.0"]


def _fixture_dir() -> Path | None:
    # Production collection must never silently accept canned evidence.
    return None


def approved_assignment(prompt: str) -> dict:
    """Read scope from the exact spec Studio approved, never from agent output."""
    blocks = re.findall(r"```crew-rea\s*\n(.*?)```", prompt, re.DOTALL)
    if len(blocks) != 1:
        raise ReaFailed("Approved spec requires exactly one crew-rea JSON block with question, target, scope, permitted_actions (static-local).")
    try:
        data = json.loads(blocks[0])
    except ValueError as e:
        raise ReaFailed(f"Invalid approved crew-rea JSON: {e}") from e
    if not isinstance(data, dict) or any(not isinstance(data.get(k), str) or not data[k].strip()
                                        for k in ("question", "target", "scope", "permitted_actions")):
        raise ReaFailed("Approved REA question, target, scope and permitted_actions must be non-empty strings")
    if data["permitted_actions"] != "static-local":
        raise ReaFailed("Only static-local REA actions are supported (no target execution, remote access or provider calls)")
    if not Path(data["target"]).is_absolute():
        raise ReaFailed("Approved REA target must be an absolute local path")
    path = Path(data["target"]).resolve()
    if str(path).startswith(("\\\\", "//")):
        raise ReaUnsupportedTarget("Network share targets are outside static-local scope")
    if not path.exists():
        raise ReaFailed(f"Approved REA target does not exist: {path}")
    kind, _ = classify_target(str(path))
    if kind != "javascript":
        raise ReaUnsupportedTarget("Only local JavaScript directories/ASAR are enabled for deterministic collection")
    return {k: data[k] for k in ("question", "target", "scope", "permitted_actions")}


@dataclass
class ReaResult:
    ok: bool
    target: str
    kind: str
    command: list[str]
    evidence_path: str = ""
    evidence: dict = field(default_factory=dict)
    summary: dict = field(default_factory=dict)
    error: str = ""


def _load_fixture(kind: str, out_path: Path) -> ReaResult:
    """Test path: load canned REA output instead of running the CLI.

    The fixture directory is named by the caller; each file is named
    `<kind>.json` and holds either {"ok": true, "evidence": {...}} or
    {"ok": false, "error": "..."}. Missing/unreadable/invalid fixture files
    fail loudly — fixtures must never silently stand in for evidence.
    """
    fixture_dir = _fixture_dir()
    assert fixture_dir is not None
    path = fixture_dir / f"{kind}.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ReaFailed(f"REA fixture missing: {path} (set REA_FIXTURE_DIR to a directory containing <kind>.json)")
    except (OSError, ValueError) as e:
        raise ReaFailed(f"REA fixture unreadable: {path}: {e}")
    if not payload.get("ok", False):
        raise ReaFailed(f"REA fixture reports failure: {payload.get('error', 'unknown fixture error')}")
    evidence = payload.get("evidence")
    if not isinstance(evidence, dict):
        raise ReaFailed(f"REA fixture {path} has no evidence object")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(evidence, indent=1), encoding="utf-8")
    return ReaResult(ok=True, target=payload.get("target", "<fixture>"), kind=kind,
                     command=["<fixture>"], evidence_path=str(out_path),
                     evidence=evidence, summary=summarize(evidence, payload.get("target", "<fixture>")))


def _module_paths(evidence: dict) -> list[str]:
    paths: list[str] = []
    try:
        nodes = evidence["normalized_result"]["graph"]["nodes"]
    except (KeyError, TypeError):
        return paths
    for n in nodes:
        if not isinstance(n, dict) or n.get("kind") != "javascript-module":
            continue
        for obs in n.get("observations", []) or []:
            props = obs.get("properties", {}) if isinstance(obs, dict) else {}
            mp = props.get("module_path") if isinstance(props, dict) else None
            if isinstance(mp, str) and mp not in paths:
                paths.append(mp)
    return sorted(paths)


def _endpoint_paths(evidence: dict) -> list[str]:
    paths: list[str] = []
    try:
        nodes = evidence["normalized_result"]["graph"]["nodes"]
    except (KeyError, TypeError):
        return paths
    for n in nodes:
        if not isinstance(n, dict) or n.get("kind") != "endpoint":
            continue
        key = (n.get("identity", {}) or {}).get("key", "")
        if '"/' in key:
            start = key.find('"/') + 1
            end = key.find('"', start)
            if end > start and key[start:end] not in paths:
                paths.append(key[start:end])
    return sorted(paths)


def _unknowns(evidence: dict) -> list[dict]:
    try:
        sg = evidence["normalized_result"]["semantic_graph"]
    except (KeyError, TypeError, AttributeError):
        return []
    out = []
    for u in sg.get("unknowns", []) or []:
        if not isinstance(u, dict):
            continue
        loc = (((u.get("evidence", {}) or {}).get("location", {}) or {}).get("value", {}) or {})
        src = loc.get("source", "?")
        rng = loc.get("range", loc)
        where = f"{src}:{rng.get('start', {}).get('line', '?')}" if isinstance(rng, dict) else str(src)
        out.append({
            "id": u.get("unknown_id", "?"),
            "family": u.get("family", "?"),
            "reason": u.get("reason", "?"),
            "detail": u.get("detail", ""),
            "where": where,
        })
    return out


def summarize(evidence: dict, target: str) -> dict:
    """Deterministic projection of REA evidence into reviewable facts.

    Only reports what the evidence file literally contains: module and
    endpoint inventories, unknown families, and the engine's own stated
    limitations. Never infers behavior — inference is the agent's job.
    """
    mods = _module_paths(evidence)
    eps = _endpoint_paths(evidence)
    unknowns = _unknowns(evidence)
    fams: dict[str, int] = {}
    for u in unknowns:
        fams[u["family"]] = fams.get(u["family"], 0) + 1
    try:
        limitations = list(evidence["normalized_result"].get("limitations", []) or [])
    except (KeyError, TypeError, AttributeError):
        limitations = []
    try:
        evidence_id = evidence.get("evidence_id", "")
    except AttributeError:
        evidence_id = ""
    facts = [f"analyzed target: {target}"]
    facts += [f"module present: {m}" for m in mods]
    facts += [f"endpoint observed: {e}" for e in eps]
    if unknowns:
        facts.append(f"{len(unknowns)} unknown(s) recorded by the engine: " +
                     ", ".join(f"{k} x{v}" for k, v in sorted(fams.items())))
    return {
        "target": target,
        "evidence_id": evidence_id,
        "modules": mods,
        "module_count": len(mods),
        "endpoints": eps,
        "facts": facts,
        "unknown_families": fams,
        "unknown_count": len(unknowns),
        "limitations": [str(x) for x in limitations],
    }


def run_investigation(target: str, out_dir: str, *, timeout: int = 300,
                      runner=subprocess.run) -> ReaResult:
    """Run the official REA CLI against the target and persist raw evidence.

    Returns a ReaResult whose evidence file the agent phase consumes.
    Raises ReaUnavailable / ReaUnsupportedTarget / ReaFailed — never a finding.
    `runner` is injectable for tests that must not spawn processes.
    """
    target = (target or "").strip()
    kind, command = classify_target(target)
    out_path = Path(out_dir) / "rea_evidence.json"
    if out_path.exists():
        raise ReaFailed(f"REA evidence already exists: {out_path}; use a fresh run rather than overwrite prior evidence")

    fixture_dir = _fixture_dir()
    if fixture_dir is not None:
        return _load_fixture(kind, out_path)

    if kind != "javascript":
        raise ReaUnsupportedTarget("Only static local JavaScript directory/ASAR collection is enabled")
    argv = _npx_prefix() + [command, target, "--json"]
    def diagnostic(error: str, returncode=None):
        # CLI output may contain arbitrary target text: redact common secret shapes.
        safe = re.sub(r"(?i)(bearer\s+|(?:api[_-]?key|token|password|secret)[\s\"']*[:=][\s\"']*)[^\s\"',}]+", r"\1[REDACTED]", error)
        safe = re.sub(r"sk-[A-Za-z0-9_-]+", "[REDACTED]", safe)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        (out_path.parent / "rea_diagnostic.json").write_text(json.dumps({
            "command": argv, "returncode": returncode, "diagnostic": safe[-2000:]
        }, indent=2), encoding="utf-8")
        return safe[-2000:]
    try:
        completed = runner(argv, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    except FileNotFoundError as e:
        diagnostic("REA executable not found")
        raise ReaUnavailable(f"could not launch the REA CLI ({e}); install Node.js 22+ and ensure `npx` is on PATH")
    except subprocess.TimeoutExpired:
        diagnostic(f"REA CLI timed out after {timeout}s")
        raise ReaFailed(f"REA CLI timed out after {timeout}s on {target!r}; narrow the approved target and retry in a fresh run")
    except OSError as e:
        diagnostic(str(e))
        raise ReaUnavailable(f"could not launch the REA CLI: {e}")
    if completed.returncode != 0:
        tail = diagnostic("stderr:\n" + (completed.stderr or "") + "\nstdout:\n" + (completed.stdout or ""), completed.returncode)
        raise ReaFailed(f"REA CLI exited {completed.returncode} on {target!r}: {tail.strip() or 'no output'}")
    try:
        evidence = json.loads(completed.stdout)
    except (ValueError, TypeError) as e:
        diagnostic(f"Invalid JSON: {e}", completed.returncode)
        raise ReaFailed(f"REA CLI output was not valid JSON: {e}")
    if not isinstance(evidence, dict) or "evidence_id" not in evidence:
        diagnostic("Missing evidence_id in CLI result", completed.returncode)
        raise ReaFailed("REA CLI output is JSON but not a REA evidence bundle (missing evidence_id)")
    if (not isinstance(evidence.get("normalized_result"), dict)
            or not isinstance(evidence["normalized_result"].get("graph"), dict)
            or evidence.get("operation") != "analyze_javascript_application"):
        diagnostic("Incomplete or unexpected JavaScript evidence bundle", completed.returncode)
        raise ReaFailed("REA CLI returned incomplete or unexpected JavaScript evidence (operation/normalized_result.graph)")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(evidence, indent=1), encoding="utf-8")
    diagnostic("success", completed.returncode)
    return ReaResult(ok=True, target=target, kind=kind, command=argv,
                     evidence_path=str(out_path), evidence=evidence,
                     summary=summarize(evidence, target))


def as_envelope(result: ReaResult, question: str, scope: str, permitted_actions: str):
    """Shape a deterministic collection result as the agent's previous context.

    Same adapter pattern as changes.as_envelope / quality.as_envelope: code
    computes, the agent consumes through the one door every handoff uses.
    """
    from .data_types import ReaEvidence
    context_path = ""
    if result.ok and result.evidence_path:
        path = Path(result.evidence_path).with_name("rea_context.json")
        graph = result.evidence.get("normalized_result", {}).get("graph", {})
        nodes = graph.get("nodes", [])
        selected = nodes[:32]
        def authority(ev):
            return {k: ev.get(k) for k in ("authority", "state", "confidence", "location", "limitations")}
        path.write_text(json.dumps({
            "evidence_id": result.evidence.get("evidence_id"),
            "raw_evidence_path": str(Path(result.evidence_path).resolve()),
            "summary": result.summary,
            "observations": [{"node_id": n.get("node_id"), "kind": n.get("kind"),
                              "observations": [{"label": o.get("label"),
                                  "properties": {k: v for k, v in o.get("properties", {}).items() if k in ("module_path", "exported_name", "module_format", "path", "entrypoint", "semantic_role")},
                                  "evidence": authority(o.get("evidence", {}))} for o in n.get("observations", [])]} for n in selected],
            "relationships": [{"edge_id": e.get("edge_id"), "relation": e.get("relation"),
                "properties": e.get("properties", {}), "evidence": authority(e.get("evidence", {}))} for e in graph.get("edges", [])[:64]],
            "omitted_observation_nodes": max(0, len(nodes) - 32),
            "omitted_relationships": max(0, len(graph.get("edges", [])) - 64),
            "unknowns": _unknowns(result.evidence),
            "projection_limitations": ["Selected module/endpoint observations only; consult raw evidence for graph edges and omitted nodes. Static inference authority must not be promoted to runtime fact."],
        }, indent=1), encoding="utf-8")
        context_path = str(path.resolve())
    return ReaEvidence(
        status="success" if result.ok else "fail",
        summary=(f"REA {result.kind} inspection of {result.target}: "
                 f"{result.summary.get('module_count', 0)} modules, "
                 f"{len(result.summary.get('endpoints', []))} endpoints, "
                 f"{result.summary.get('unknown_count', 0)} unknowns recorded"
                 if result.ok else f"REA collection failed: {result.error}"),
        artifacts=[result.evidence_path] if result.ok and result.evidence_path else [],
        ok=result.ok,
        question=question,
        scope=scope,
        permitted_actions=permitted_actions,
        target=result.target,
        kind=result.kind,
        command=result.command,
        evidence_path=result.evidence_path,
        context_path=context_path,
        module_count=result.summary.get("module_count", 0),
        endpoints=list(result.summary.get("endpoints", [])),
        unknown_count=result.summary.get("unknown_count", 0),
        limitations=list(result.summary.get("limitations", [])),
        error=result.error,
        notes_for_next_agent=(
            f"Investigation question: {question}. Scope: {scope}. "
            f"Permitted actions: {permitted_actions}. "
            "Read context_path first; inspect raw evidence as needed before writing the handoff; cite "
            "file paths and source ranges from it, never from memory."),
    )


def persist_handoff(envelope, run):
    """Engine-owned rendering: one typed interpretation, two identical durable copies."""
    handoff = run.context_handoff_dir / "rea_handoff.md"
    spec = Path(run.repo_root) / "specs" / f"{run.adw_id}_rea_handoff.md"
    if handoff.exists() or spec.exists():
        raise ReaFailed("REA handoff destination already exists; preserve it and start a fresh run")
    data = envelope.model_dump(exclude={"artifacts"})
    text = "# REA investigation handoff\n\n" + "\n\n".join(
        f"## {key.replace('_', ' ').title()}\n\n" + (json.dumps(value, indent=2, ensure_ascii=False) if isinstance(value, (dict, list)) else str(value))
        for key, value in data.items()) + "\n"
    spec.parent.mkdir(parents=True, exist_ok=True)
    handoff.write_text(text, encoding="utf-8")
    spec.write_text(text, encoding="utf-8")
    envelope.artifacts = [str(handoff), str(spec)]
    return envelope


def interpretation_matches(assignment, result):
    original = Path(result.evidence_path).read_bytes()
    def gate(envelope, run):
        from .data_types import GateReport
        report = GateReport()
        for key, value in assignment.items():
            report.check(f"approved REA {key}", getattr(envelope, key, None) == value, f"must preserve approved {key}")
        report.check("raw evidence unchanged", Path(result.evidence_path).read_bytes() == original, "evidence is immutable")
        report.check("requirements present", bool(envelope.behavioral_requirements), "requirements required for planning")
        report.check("validation cases present", bool(envelope.validation_cases), "validation cases required")
        return report
    return gate


def plan_consumes_evidence(assignment, result):
    def gate(envelope, run):
        from .data_types import GateReport
        report = GateReport()
        files = [Path(p) for p in envelope.artifacts if Path(p).is_file()]
        text = getattr(envelope, "plan_markdown", "") or "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in files)
        report.check("REA plan content", bool(text.strip()), "plan must have real content")
        report.check("REA handoff referenced", "rea_handoff.md" in text or (bool(result.evidence.get("evidence_id")) and result.evidence["evidence_id"] in text), "cite supplied handoff or evidence id")
        for module in result.summary.get("modules", [])[:8]:
            report.check(f"module {module} consumed", module in text, "named evidence must inform the plan")
        for cited in re.findall(r"`([A-Za-z]:[\\/][^`\r\n]+)`", text):
            if str(Path(cited)).lower().startswith(str(Path(assignment["target"])).lower()):
                report.check("cited source exists", Path(cited).exists(), cited)
        return report
    return gate


def persist_plan(envelope, run):
    plan = run.context_handoff_dir / "plan.md"
    spec = Path(run.repo_root) / "specs" / f"{run.adw_id}_investigation_plan.md"
    if plan.exists() or spec.exists():
        raise ReaFailed("Investigation plan already exists; preserve it and use a fresh run")
    spec.parent.mkdir(parents=True, exist_ok=True)
    plan.write_text(envelope.plan_markdown, encoding="utf-8")
    spec.write_text(envelope.plan_markdown, encoding="utf-8")
    envelope.artifacts = [str(plan), str(spec)]
    return envelope


def handoff_matches(assignment: dict, result: ReaResult):
    """Require durable evidence and handoff copies with the approved identity."""
    original_hash = hashlib.sha256(Path(result.evidence_path).read_bytes()).hexdigest()
    def gate(envelope, run):
        from .data_types import GateReport
        report = GateReport()
        for key, value in assignment.items():
            report.check(f"approved REA {key}", getattr(envelope, key, None) == value,
                         f"handoff must preserve approved {key}")
        paths = {Path(p).resolve() for p in envelope.artifacts}
        handoff = (run.context_handoff_dir / "rea_handoff.md").resolve()
        specs = (Path(run.repo_root) / "specs").resolve()
        copies = [p for p in paths if p.is_relative_to(specs) and p.is_file()]
        report.check("persisted REA handoff", handoff in paths and handoff.is_file(), str(handoff))
        report.check("REA specs copy", bool(copies), "handoff requires a specs copy")
        if handoff.is_file() and copies:
            report.check("REA copies agree", any(p.read_bytes() == handoff.read_bytes() for p in copies),
                         "specs copy must preserve the handoff")
        report.check("raw REA evidence persisted", Path(result.evidence_path).is_file(), result.evidence_path)
        if Path(result.evidence_path).is_file():
            report.check("raw evidence unchanged", hashlib.sha256(Path(result.evidence_path).read_bytes()).hexdigest() == original_hash,
                         "agent must not rewrite collected evidence")
        report.check("behavioral requirements", bool(envelope.behavioral_requirements), "required for planning")
        report.check("validation cases", bool(envelope.validation_cases), "required for verification")
        return report
    return gate
