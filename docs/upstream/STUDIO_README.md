# SSSF Studio – Unified Control Layer for Super Simple Software Factory

**SSSF Studio** is a unified, polished web application and control layer built on top of the **Super Simple Software Factory (SSSF)**. It bridges the gap between rough ideas and deterministic factory execution.

---

## 🌟 Core Pillars

1. **Interactive Discovery / Intake (The Missing Piece)**
   - Start from a rough description, user story, or uploaded markdown file.
   - A dedicated **Discovery Agent** analyzes the request across 5 structured dimensions:
     - ⚠️ **Missing Requirements & Edge Cases** (error handling, testing, boundaries, persistence)
     - ❓ **Ambiguities & Unstated Assumptions** (latency, scale, isolation)
     - 💡 **Concrete Architectural Suggestions** (with 1-click **Accept** and **Reject** patching into the spec)
     - 💬 **Open Questions for the Engineer** (interactive multiple-choice or custom text answers)
     - 🛡️ **Potential Risks & Mitigations** (scope creep, context consumption, cross-platform shell quirks)
   - Real-time dual-pane workspace: conversational intake on the left, live editable/previewable specification document on the right.
   - **Approve Specification**: One-click sign-off writes the approved specification directly into `<target-repo>/requests/approved-spec.md` with full metadata and audit trail.

2. **Visual Agent Roster Editor (`sssf.config.yaml`)**
   - Visual cards for all configured agents (`planner`, `builder`, `scout`, `reviewer`, `documenter`, and custom agents).
   - Dropdown selectors for `provider/model-id` with validation.
   - Thinking level selectors (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`).
   - Interactive tool allowlist checkboxes (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, `subagent_*`).
   - Write boundaries configuration (`writes: []` for enforced read-only in repo, path scopes like `specs/`, or unrestricted for builder).
   - **Multiple Named Rosters**: Instant switching between presets:
     - *Factory Default* (Balanced: Gemini Flash, Kimi K3, GPT-5.6)
     - *Frontier Reasoning* (Deep reasoning: Claude 3.7 Sonnet thinking + GPT-5)
     - *Rapid Economy* (Ultra-fast, lowest token cost: Gemini 2.5 Flash + Haiku 3.5)
     - *Custom Presets*: Save and apply any custom configuration.
   - **Secure API Key Management**: Safely inspects and updates the target repository's `.env` (gitignored). Masked secrets, never committed.

3. **Factory Launch & Workflow Execution**
   - Workflow catalog discovering all available ADWs in the target repository (`adw_simple_sdlc.py`, `adw_plan_build_test.py`, `adw_plan_build.py`, `adw_build_test.py`, `adw_plan.py`, `adw_scout.py`, etc.).
   - Smart workflow recommendation based on approved specification.
   - One-click launch executing `uv run adws/<script>.py requests/approved-spec.md --config ...`.
   - Real-time streaming console output with live phase progression indicators.
   - Process control: running status indicator, PID tracking, and immediate **Stop Run** abort capability.

4. **Embedded Observability (Factory Visualizer)**
   - Directly embeds the full SSSF SQLite trace visualizer inside the same workspace.
   - Real-time 500ms WAL polling against `adws/adw_data/sssf.db`.
   - Sessions list, phase waterfall, agent color-coded lanes, expandable tool calls (`read`, `bash`, `edit`, `write`), gate verification evidence, typed JSON envelopes, token spend breakdown, and context window occupancy bar.

5. **Multi-Project & Stamping Support**
   - Switch target repository dynamically from the header.
   - Live health indicator: detects if the factory is stamped, presence of `sssf.config.yaml`, SQLite trace DB, git branch, and `.env`.
   - If a target repo is not yet stamped, offers a 1-click **Stamp Factory into this repo** action using the official install path (`install.py`).

---

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh/) (v1.1+)
- [uv](https://github.com/astral-sh/uv) (v0.12+)
- Python 3.11+

### Running SSSF Studio

From the repository root:

```bash
# Using just
just studio

# Or directly with bun
cd studio
bun run server/index.ts
```

Open your browser to: **http://localhost:4620**

### Development Mode (Vite Hot-Reload)

```bash
cd studio
bun run dev:all
# Frontend: http://localhost:5173
# API:      http://localhost:4620
```

---

## 🔒 Zero Core Modifications Contract

In accordance with SSSF design principles:
- **No core ADW scripts** (`adws/adw_*.py`) or internal modules (`adws/adw_modules/`) are modified.
- The factory is treated as a deterministic black-box execution engine:
  - Discovery produces the approved markdown specification.
  - SSSF Studio passes that specification as input to the factory.
  - SSSF Studio observes results directly via the non-blocking SQLite WAL mirror.
