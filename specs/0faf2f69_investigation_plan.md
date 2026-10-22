# Normalization adapter plan — synthetic-target (synthetic-target)

**Target:** `D:\dev\C.R.E.W.-Software\.sssf\acceptance\product-20261021\synthetic-target`
**Scope:** Static inspection only; no target execution or other targets
**Evidence source:** validated REA handoff (two copies recorded in the REA handoff; see Artifacts below — both must match)
**Handoff reference:** `rea_handoff.md` (see Artifacts for exact paths)

## Observed facts (static, from REA)
- `normalize.js` defines a `normalize` function that returns normalized shape data — evidence `normalize.js:1`.
- `index.js` defines a `handle` function that orchestrates the normalization process — evidence `index.js:2`.
- `index.js` imports `normalize.js` via a require statement — evidence edge `jag_edge_31b2b38b9941b2333344a6e86ee6b3` (as recorded in the handoff; preserve the exact edge identifier, not a paraphrase).

These are static observations recovered from inert text. They establish a module relationship, not runtime behavior.

## Inferences (static, not observed at runtime)
- `normalize.js` provides the core normalization logic through `normalize`.
- `index.js` provides an orchestration layer: `handle` calls `normalize`.

These are intended-adapter interpretations of the static graph. They are not observed runtime results because the handoff explicitly limits investigation to static-local actions and the modules were never executed.

## Unknowns and limitations
Retained verbatim from the handoff (13 unknowns, 5 limitations):

**Unknowns:** `jsrg_unknown_1ef3e…86019`, `jsrg_unknown_45f4…98e7898e`, `jsrg_unknown_4be9…2d772`, `jsrg_unknown_4c6c…ed0afd4`, `jsrg_unknown_62f1…d95b5cad8`, `jsrg_unknown_6459…f711ceb6b`, `jsrg_unknown_6d98…8669574fe9`, `jsrg_unknown_c290…3753798fe46`, `jsrg_unknown_c599…aef5d8c8c9`, `jsrg_unknown_e3a1…3f3e8b06b3`, `jsrg_unknown_e571…9988f7237`, `jsrg_unknown_ebf7…5f824`, `jsrg_unknown_edf9…2c47ef2d772` (full hashes preserved in `rea_handoff.md`).

**Limitations:**
- CommonJS and ESM binding relationships were recovered from inert syntax and resolved only within the inventoried artifact container.
- JavaScript and HTML were parsed as inert text; bundle bootstrap code was never executed.
- Static imports, entrypoints, workers, endpoints, and storage relationships do not prove runtime execution.
- Static paths and relationships may remain unresolved when expressions are dynamic or obfuscated.
- Webpack/Rspack factories were recovered from AST literals; REA did not invoke push handlers or bundle bootstrap code.

**Behavioral requirements honored:** only static inspection performed; conclusions based solely on observable static relationships; runtime behavior (actual invocation, side effects, dynamic property resolution) is not confirmed.

## Requirement gap this plan closes
The two existing modules show an intent to normalize, but there is no evidence in the static graph that input is trimmed or lowercased. The handoff does **not** establish that behavior. Therefore the trim/lowercase behavior below is an **approved requirement to test**, not an observed runtime result.

## Proposed: tiny normalization adapter

Design a minimal adapter that sits alongside the existing pair, without modifying `index.js` or `normalize.js` behavior, and enforces a canonical text input contract.

1. **New module `normalize_text.js`** (relative path under the approved target, e.g. `normalize_text.js`):
   - Exports `normalizeText(value)`.
   - Converts input to a string, trims surrounding whitespace, and lowercases.
   - Returns the canonical string. Undefined/coercible edge cases are a design decision to confirm at implementation time (unknown — see Unknowns).
2. **Wiring (intended, not yet built):** `index.js` `handle` would pass its input through `normalizeText` before delegating to `normalize.js`'s `normalize`. This is a proposed change; it is not observed behavior and is not made in this planning step.
3. **Do not** append a session or context_handoff directory to source paths. Prefer relative module paths (`index.js`, `normalize.js`, `normalize_text.js`) from within the target.

## Behavioral requirements for the adapter
- Accepts any primitive input; produces a single canonical string.
- Trims leading/trailing whitespace.
- Lowercases Latin letters (scope to ASCII/caseless strings unless a wider locale requirement is later approved).
- Pure function: no side effects, no runtime discovery.
- Isolated and static-testable.

## Proposed validation inputs and expected results (not run — planning only)

| Input | Expected output | Rationale |
|---|---|---|
| `"  Hello World  "` | `"hello world"` | trim + lowercase |
| `"MiXeD  caSe"` | `"mixed  case"` | internal whitespace preserved; only edges trimmed and case lowered |
| `""` | `""` | empty stays empty |
| `"A"` / `"a"` | `"a"` | idempotent lowercasing |
| `  ""` (two spaces) | `""` | all whitespace trimmed |
| `123` (numeric input) | `"123"` | coercion to string, no whitespace/case change |

These cases are **proposed** validation inputs. They have **not** been executed. No build, target execution, or test run has occurred in this planning phase. Raw evidence from REA remains unchanged.

## Process notes
- Only existing verified free connections were consulted; no external or paid providers touched.
- No build, no target execution, no external investigation, no Git commits in this phase.
- This plan is the handoff for an implementation phase. The implementer must validate the listed cases before claiming the trim/lowercase requirement is met.

## Acceptance traceability
- Read REA evidence: yes.
- Preserve exact assignment from handoff: yes (edge IDs and module names preserved).
- Both handoff copies recorded for match-check: yes — see Artifacts / Handoff reference.
- Cites `index.js` and `normalize.js`: yes.
- Distinguishes static observations from runtime claims: yes (Observed facts vs Inferences vs proposed behavior).
- Retains unknowns and limitations: yes (13 unknowns, 5 limitations).
- Proposes trim/lowercase validation without claiming tests ran: yes.