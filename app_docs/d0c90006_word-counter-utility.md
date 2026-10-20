# Word Counter — single-page utility write-up

## What changed

A new standalone **Word Counter** page: type or paste text, get live word, character,
sentence and reading-time counts. It is one self-contained HTML file at the repo root —
no framework, no `package.json`, no build step, no server, no external assets, no
network calls, no persistence. It follows the same shape as the earlier `color-keeper.html`
and `guestbook.html` utilities already in this repo.

Two files carry the work, both new:

| File | Role |
|---|---|
| `index.html` (repo root) | The entire application — markup, inline `<style>`, inline `<script>`. Currently **untracked** in git. |
| `specs/bd98e958_word-counter-utility.md` (231 lines) | The approved build plan: element contract, exact counting rules, CSS constraints, edge-case table, verification checklist. Approval ID `appr-mvh21ecnz551`, version 1, hash `2ea34723d1ca11b9`. Committed as `017fc3b`. |

One unrelated file also changed in the same window: `adws/adw_sssf_config/sssf.config.yaml`
raised the builder agent's `max_tokens` from `150000` to `200000`. That tunes the agent
pipeline, not the app.

The repo's `.crew-quality.json` only covers `studio/`, so `index.html` is not exercised by
`bun run build` / `vue-tsc` / `node scripts/check.mjs`. It is verified by hand, per the spec.

## How counts are computed

One `input` event listener on the textarea calls `update()`, which recomputes all four
metrics on every keystroke, paste, cut, drag-and-drop, and IME composition. A final
`update()` call at load renders the zero state so no metric is ever blank. Values are
written with `textContent`, never `innerHTML`, so pasted `<script>` or `&` shows as
literal text.

- **Words** — trim, then split on whitespace runs (`/\s+/`). Empty or whitespace-only
  input → `0`. Newlines, tabs and multiple spaces never create empty words; leading and
  trailing whitespace does not count.
- **Characters** — `text.length`, i.e. every character typed including spaces, newlines
  and tabs. UTF-16 code units, so an astral-plane emoji counts as 2 (standard
  `textarea.value.length` behavior; no emoji-specific code).
- **Sentences** — trim, split on runs of `.`, `!`, `?`, count the non-empty segments.
  `"Hello world"` → 1; `"One. Two. Three."` → 3; `"Wait... what?"` → 2 (the `...` run is
  one delimiter); `"He said \"stop!\""` → 2. Abbreviations (`Dr.`, `e.g.`) over-count —
  an accepted limitation of the spec's stated assumption, no abbreviation heuristics.
- **Reading time** — at 200 words per minute. Under 200 words → `"< 1 min"` (so an empty
  box shows `< 1 min`); otherwise `Math.ceil(words / 200)` minutes, rounded up so it never
  understates. 200 words → `1 min`; 250 → `2 min`; 400 → `2 min`; 401 → `3 min`.

## The page itself

Markup is deliberately bare: a single `<textarea id="text-input">` plus a `aria-live`
section of four read-only `<span>` metrics (`#word-count`, `#character-count`,
`#sentence-count`, `#reading-time`). There is no visible heading, no button, no link, no
label element — the textarea carries `aria-label="Text to measure"` — and no theme
toggle. Exactly one focusable element exists on the page.

CSS is plain, system font stack only, centered column capped at `46rem`, metric cards in a
wrapping flex row with `tabular-nums` so numbers do not jitter while typing. There are no
animations, no `@media` dark-mode rules, no web fonts, no `@import`.

## How to open it

Double-click `index.html` — it runs straight from `file://` with no tooling. If your
browser is awkward about `file://`, serve the folder over plain HTTP instead:

```bash
python -m http.server 8000     # then open http://127.0.0.1:8000/index.html
```

This file is separate from the C.R.E.W. studio app (`Start-Crew.cmd`, port 4620); the
studio does not serve it.

## How to verify it

The spec's section 6 checklist, condensed — exercise each and confirm the observed
numbers:

1. Open from `file://` → no console errors, no network requests, no missing resources.
2. Type `Hello world` → Words `2`, Characters `11`, Sentences `1`, `< 1 min`.
3. Paste a multi-sentence paragraph → all four metrics change immediately, no button.
4. Type `a b c` → Characters `5` (spaces included).
5. Type `One. Two! Three?` → Sentences `3`; `No punctuation here` → `1`.
6. Paste exactly 200 words → `1 min`; 201 words → `2 min`; 50 words → `< 1 min`.
7. Clear the box → `0`, `0`, `0`, `< 1 min`.
8. DevTools → Elements: one `<textarea>` and four metric readouts; no `<button>`,
   `<input>`, `<a href>`, or heading. Tab reaches only the textarea.
9. Reload after typing → the box is empty and metrics are zero; Local Storage and
   Cookies empty for the page.
10. DevTools → Network: zero requests other than the local file; no service workers; no
    `fetch`/`XHR` in the source.
11. Search the source for `http://`, `https://`, `//cdn` → no hits.
12. At 320px and 1280px widths → no horizontal scroll, all four metrics readable.

## Notes for the next engineer

- **One deviation from the spec's sketch.** The spec showed a bare top-level script using
  `const`/`let`; the build wraps the script in an IIFE with `'use strict'` and uses `var`
  throughout. Behavior is identical; the IIFE keeps nothing on `window`.
- **The spec's HTML/JS snippets were sketches.** The built `index.html` is authoritative.
- **No persistence, no network, no dependencies** — all three are explicitly prohibited
  by the spec and hold in the built file.
