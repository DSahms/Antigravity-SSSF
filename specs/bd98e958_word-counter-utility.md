# Word Counter Utility — Build Plan

**Approved spec:** Approval ID `appr-mvh21ecnz551`, version 1, hash `2ea34723d1ca11b9`.
**Scope:** One self-contained HTML file. No framework, no external dependencies, no external assets, no server, no storage.
**Previous envelope:** none — this is a greenfield, single-file deliverable.

---

## 1. Deliverable

| Path | What |
|---|---|
| `index.html` (repo root) | The entire application: HTML + inline `<style>` + inline `<script>`. Opens directly from disk (`file://`) with no build step, no server, no install. |

Nothing else is created or modified. No `package.json` change, no bundler, no npm packages, no CDN links, no web fonts, no image files, no `.crew-quality.json` for this deliverable (the repo's own quality file covers `studio/` only, and the spec's boundary is a single file).

Repo precedent for standalone utilities: `color-keeper.html`, `guestbook.html` at the repo root. This plan follows the same pattern, using the exact filename the approved spec names: `index.html`.

---

## 2. Page structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Word Counter</title>
  <style> /* plain CSS, section 3 */ </style>
</head>
<body>
  <main class="app">
    <textarea id="text-input" class="text-input" aria-label="Text to measure"
              placeholder="Type or paste your text here…" spellcheck="false"></textarea>

    <section class="metrics" aria-label="Text metrics" aria-live="polite">
      <div class="metric">
        <span class="metric__label">Words</span>
        <span class="metric__value" id="word-count">0</span>
      </div>
      <div class="metric">
        <span class="metric__label">Characters</span>
        <span class="metric__value" id="character-count">0</span>
      </div>
      <div class="metric">
        <span class="metric__label">Sentences</span>
        <span class="metric__value" id="sentence-count">0</span>
      </div>
      <div class="metric">
        <span class="metric__label">Reading time</span>
        <span class="metric__value" id="reading-time">&lt; 1 min</span>
      </div>
    </section>
  </main>
  <script> /* plain JS, section 4 */ </script>
</body>
</html>
```

### Element contract

| Element | Role |
|---|---|
| `#text-input` | The only interactive element on the page. Multi-line `<textarea>`. |
| `#word-count` | Word count. |
| `#character-count` | Character count including spaces. |
| `#sentence-count` | Sentence count. |
| `#reading-time` | Estimated reading time at 200 wpm. |

### Minimalism rules (acceptance criterion: "Interface contains exclusively the text area and metric displays")

- **No visible heading, no buttons, no links, no checkboxes, no theme switch, no clear button, no export/copy button, no counter-style chrome.**
- The textarea gets its accessible name from `aria-label="Text to measure"` — no separate visible or hidden `<label>` element, no `<h1>`.
- The four metrics are read-only text (`<span>`), not form controls.
- Exactly one focusable element exists on the page (the textarea). The builder should confirm this in DevTools: the page has a single interactive element.
- The browser tab `<title>` and the `<head>` are not "interface" and are fine.
- The `placeholder` is a hint inside the textarea, not a control.

---

## 3. CSS (plain, no framework)

- System font stack only: `font-family: system-ui, -apple-system, "Segoe UI", sans-serif;` — no web fonts, no `@import`.
- Layout: centered column, `max-width: 46rem`, `margin: 0 auto`, generous vertical padding; page background a light neutral, text a dark neutral; `line-height: 1.5`.
- `.text-input` — `width: 100%`, `min-height: 16rem`, `resize: vertical`, `padding: 0.85rem 1rem`, `border: 1px solid #d6dae1`, `border-radius: 10px`, `background: #ffffff`, `color: inherit`, `font: inherit`, `font-size: 1rem`. Visible `:focus-visible` outline (the textarea must show a focus ring for keyboard users).
- `.metrics` — flex row that wraps (`display: flex; flex-wrap: wrap; gap: 0.75rem;`), `margin-top: 1rem`.
- `.metric` — bordered rounded card (`background: #ffffff`, `border: 1px solid #e2e5ea`, `border-radius: 10px`, `padding: 0.75rem 1rem`), `flex: 1 1 9rem`, `min-width: 9rem`.
- `.metric__label` — `display: block`, small uppercase muted text (`font-size: 0.78rem`, `letter-spacing: 0.07em`, `color: #5b6474`).
- `.metric__value` — `display: block`, `font-size: 1.5rem`, `font-weight: 600`, tabular numerals (`font-variant-numeric: tabular-nums`) so the numbers do not jitter while typing.
- No animations at all (a live-updating readout does not need motion). If any transition is added, keep it under ~150ms and respect `prefers-reduced-motion`.
- No `@media` dark-mode rules (that would be a hidden theme switch — the spec forbids theme toggles).
- Responsive: at narrow widths the metric cards wrap onto two rows; the textarea stays full width. No horizontal scrollbar at 320px.

---

## 4. JavaScript behavior

### 4.1 Constants and element lookup

```js
const WORDS_PER_MINUTE = 200;

const textInput = document.getElementById('text-input');
const wordCountEl = document.getElementById('word-count');
const characterCountEl = document.getElementById('character-count');
const sentenceCountEl = document.getElementById('sentence-count');
const readingTimeEl = document.getElementById('reading-time');
```

Plain script at the end of `<body>`, so the elements already exist when the script runs. No `DOMContentLoaded` wrapper needed, and no IIFE/module — the simplest thing that works from `file://`.

### 4.2 Counting functions (exact rules the builder must implement)

```js
function countWords(text) {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

function countCharacters(text) {
  return text.length;
}

function countSentences(text) {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  let count = 0;
  for (const part of trimmed.split(/[.!?]+/)) {
    if (part.trim() !== '') count++;
  }
  return count;
}

function formatReadingTime(wordCount) {
  if (wordCount < WORDS_PER_MINUTE) return '< 1 min';
  return `${Math.ceil(wordCount / WORDS_PER_MINUTE)} min`;
}
```

**Documented decisions (the spec marked these as assumed — the builder implements them exactly this way and states them in the final report):**

- **Words** are delimited by whitespace runs (`/\s+/`), so newlines, tabs and multiple spaces never create empty words. Leading/trailing whitespace does not count. `""` → `0`; `"   "` → `0`.
- **Characters** = `text.length`, i.e. **every character typed, including spaces, newlines and tabs**. The spec says "including spaces"; newline characters are counted as one character each as well. (Known limitation: astral-plane characters such as emoji occupy two UTF-16 code units and therefore count as 2. This is standard `textarea.value.length` behavior; do not add emoji-specific code.)
- **Sentences** = number of non-empty segments produced by splitting on runs of `.`, `!`, `?`. Consequences, all intended:
  - `"Hello world"` (no terminal punctuation) → **1** sentence.
  - `"One. Two. Three."` → **3**.
  - `"Wait... what?"` → **2** (the `...` run is one delimiter).
  - `"He said \"stop!\""` → **2** (a quoted sentence ending in `!` counts) — acceptable under the assumed delimiter rule.
  - Abbreviations (`Dr.`, `e.g.`) will over-count. This is the accepted limitation of the spec's stated assumption; do not attempt abbreviation detection (no extra libraries, no heuristics).
- **Reading time** = `wordCount / 200` minutes.
  - `wordCount < 200` → `"< 1 min"` (this covers the empty case, so an empty box shows `< 1 min`).
  - `wordCount >= 200` → `"X min"` with `X = Math.ceil(wordCount / 200)` (never understates the time). Examples: 200 → `1 min`; 250 → `2 min`; 400 → `2 min`; 401 → `3 min`.

### 4.3 Update wiring

```js
function update() {
  const text = textInput.value;
  const words = countWords(text);
  wordCountEl.textContent = String(words);
  characterCountEl.textContent = String(countCharacters(text));
  sentenceCountEl.textContent = String(countSentences(text));
  readingTimeEl.textContent = formatReadingTime(words);
}

textInput.addEventListener('input', update);
update(); // initial render: 0 / 0 / 0 / "< 1 min"
```

- The `input` event fires for typing, pasting, cutting, deleting, drag-and-drop text, and IME composition — one listener covers every update path. No separate `paste` or `keyup` handler, no polling, no debounce (the computation is trivial and must feel instant).
- The final `update()` call renders the zero state on load, so the page never shows blank metric values.
- Use `textContent` (never `innerHTML`) to write values — the text may contain `<`/`>`/`&` and must never be interpreted as markup.

### 4.4 Prohibited (verified, not just avoided by habit)

- No `localStorage`, `sessionStorage`, cookies, IndexedDB, or any persistence.
- No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, or any server communication.
- No `<script src>`, `<link rel="stylesheet">`, `<img src>`, `@import`, web fonts, or CDN references of any kind.
- No framework or library — plain ES5+/ES2015 JavaScript only, no build step, no `type="module"` (a `file://` page must run without CORS issues; an inline classic script is safest).
- No analytics, no telemetry, no error reporting.

---

## 5. Edge cases

| Case | Expected result |
|---|---|
| Empty textarea on load | Words `0`, Characters `0`, Sentences `0`, Reading time `< 1 min` |
| Whitespace-only input (`"   \n  "`) | Words `0`, Sentences `0`, Reading time `< 1 min`, Characters = raw length (whitespace still counts as characters) |
| Single word `"hello"` | Words `1`, Characters `5`, Sentences `1`, `< 1 min` |
| `"a b"` | Words `2`, Characters `3` (spaces included) |
| Text with double spaces / tabs / newlines | Word count unaffected by extra whitespace runs |
| Exactly 200 words | Reading time `1 min` |
| Exactly 201 words | Reading time `2 min` (ceil) |
| Pasted multi-paragraph text | All four metrics update on the same keystroke/frame |
| Text containing `<script>` or `&` | Displayed as literal text, never executed or parsed |
| Very long text (100k+ characters) | Metrics still update promptly; the textarea scrolls, the page does not break |
| Browser autofill / restore on reload | The `input` event and the initial `update()` keep the display consistent |

---

## 6. Verification the builder must run and report

No test framework is required for a single HTML file, but every acceptance criterion must be exercised and reported pass/fail. Do not weaken or skip a criterion.

1. **Opens standalone** — double-click `index.html`; it loads from `file://` with no console errors, no network requests, no missing-resource errors.
2. **Live update on typing** — type `Hello world` → Words `2`, Characters `11`, Sentences `1`, `< 1 min`.
3. **Live update on paste** — paste a multi-sentence paragraph → all four metrics change immediately (no button press).
4. **Character count includes spaces** — type `a b c` → Characters `5`.
5. **Sentence counting** — type `One. Two! Three?` → Sentences `3`; type `No punctuation here` → Sentences `1`.
6. **Reading time at 200 wpm** — paste exactly 200 words → `1 min`; 201 words → `2 min`; 50 words → `< 1 min`.
7. **Empty resets** — clear the box → `0`, `0`, `0`, `< 1 min`.
8. **Interface minimalism** — DevTools → Elements: the body contains exactly one `<textarea>` and the four metric readouts. No `<button>`, `<input>`, `<select>`, `<a href>`, `<h1>`/`<h2>` heading, no theme toggle, no clear button, no export button. Keyboard Tab reaches only the textarea.
9. **No persistence** — type text, reload the page → the box is empty and the metrics are back to zero; DevTools → Application → Local Storage / Cookies are empty for this page.
10. **No server communication** — DevTools → Network: zero requests other than the local file itself; Application → no service workers; confirm no `fetch`/`XHR` in the source.
11. **No dependencies** — the file contains no external `src`/`href` references (search the source for `http://`, `https://`, `//cdn`).
12. **Responsive sanity** — at 320px and 1280px widths the layout has no horizontal scroll and all four metrics stay readable.

The builder reports the result of each item as pass/fail with the observed numbers.

---

## 7. Definition of done

- `index.html` exists at the repo root and runs standalone from `file://` with plain CSS and plain JavaScript.
- All acceptance criteria from the approved spec verified and reported by the builder.
- The rendered page contains exclusively the text area and the four metric displays.
- No persistence, no network calls, no external assets, no framework, no build step.
- Nothing else in the repo is created, modified, or deleted. No commit or push unless David explicitly asks.
