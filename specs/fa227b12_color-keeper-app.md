# Color Keeper — Build Plan

**Approved spec:** Approval ID `appr-mvh157mkkugr`, version 2, hash `6ad3b0e36bad47c5`.
**Scope:** One self-contained HTML file. No framework, no external dependencies, no external assets, no server.

---

## 1. Deliverable

| Path | What |
|---|---|
| `color-keeper.html` (repo root) | The entire application: HTML + inline `<style>` + inline `<script>`. Opens directly from disk (`file://`) with no build step. |

Nothing else is required. No package.json changes, no bundler, no npm packages, no CDN links, no image/font files.

---

## 2. Page structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Color Keeper</title>
  <style> /* plain CSS, section 3 */ </style>
</head>
<body>
  <main class="app">
    <h1>Color Keeper</h1>

    <section class="creator" aria-labelledby="creator-heading">
      <h2 id="creator-heading">Add a color</h2>
      <form id="color-form" novalidate>
        <label class="field">
          <span>Color</span>
          <input type="color" id="color-input" name="color" value="#4f46e5" />
        </label>
        <label class="field">
          <span>Name</span>
          <input type="text" id="name-input" name="name" placeholder="e.g. Deep Indigo" autocomplete="off" />
        </label>
        <button type="submit" id="save-button">Save color</button>
      </form>
      <p id="validation-message" class="message message--error" role="alert" hidden></p>
    </section>

    <section class="saved" aria-labelledby="saved-heading">
      <h2 id="saved-heading">Saved colors</h2>
      <ul id="color-list" class="color-list"></ul>
      <p id="empty-state" class="empty">No colors saved yet. Pick one above and give it a name.</p>
    </section>

    <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  </main>
  <script> /* plain JS, section 4 */ </script>
</body>
</html>
```

### Element contract

| Element | Role |
|---|---|
| `#color-form` | `submit` handler is the single save entry point (button click, or Enter in the name field). |
| `#color-input` | `<input type="color">` — native picker, always yields a 7-char lowercase hex like `#4f46e5`. |
| `#name-input` | Color name. Trimmed before validation. |
| `#validation-message` | Inline validation text, e.g. "Please give the color a name before saving." Shown only when the name is blank. |
| `#color-list` | `<ul>` of saved colors. One `<li>` per saved color. |
| `#toast` | Transient status region: "Copied!" on successful copy, or a clear error message (storage failure). |
| `#empty-state` | Hidden when the list has at least one entry. |

---

## 3. CSS (plain, no framework)

- System font stack: `font-family: system-ui, -apple-system, "Segoe UI", sans-serif;` — no web fonts.
- Layout: centered column, `max-width: 44rem`, generous spacing; form is a flex row that wraps on narrow screens.
- `.color-list` — flex wrap, `gap`, no bullets (`list-style: none`).
- `.color-item` — flex row: swatch, name, hex, delete control.
- `.color-swatch` — 44×44 `<button>`, `background` set inline to the color, `border: 1px solid rgba(0,0,0,.25)`, `border-radius: 6px`, `cursor: pointer`, visible `:focus-visible` outline (keyboard users must be able to see focus).
- `.delete-button` — small plain button, `×` character, `aria-label="Delete <name>"`, `color: #b42318`, `background: none`, `border: 1px solid currentColor`, `border-radius: 4px`.
- `.hex` — monospace (`ui-monospace, "Cascadia Code", Consolas, monospace`) so the code reads as a code value.
- `.message--error` — `#b42318` text. `.toast` — fixed bottom-center, dark background, white text, `border-radius`, transitions `opacity`; hidden via the `hidden` attribute.
- No animations longer than ~200ms except the toast fade. Respect `prefers-reduced-motion`.

---

## 4. JavaScript behavior

### 4.1 State and storage

```js
const STORAGE_KEY = 'color-keeper.colors';
let colors = [];          // in-memory list, always the source of truth for the UI
let storageOk = true;     // flips to false when localStorage is unavailable or a write fails
```

- `loadColors()` — read `localStorage.getItem(STORAGE_KEY)`, `JSON.parse`, validate the result is an array of `{hex, name}` with string fields, return it. On any throw (SecurityError in private mode, corrupt JSON, malformed shape) return `[]` and set `storageOk = false` **only** when the failure was a storage access failure; a corrupt value alone should clear the key and continue with `[]`.
- `persistColors()` — `localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))`. Returns `true` on success, `false` on throw (and sets `storageOk = false`). Never throws out of the function.

### 4.2 Save flow (`#color-form` submit)

1. `event.preventDefault()`.
2. `const name = nameInput.value.trim();`
3. If `name === ''` → show `#validation-message` ("Please give the color a name before saving."), set `nameInput.setAttribute('aria-invalid', 'true')`, focus the name field, and **stop** — nothing is saved, nothing is persisted.
4. Otherwise hide/clear the validation message and clear `aria-invalid`.
5. `const hex = colorInput.value` — the native color input already returns the exact hex; **do not round-trip it through an RGB conversion**, so the displayed code is byte-identical to what the picker produced. Store it lowercase as given.
6. Replacement rule, keyed **only** on hex:
   ```js
   const idx = colors.findIndex(c => c.hex === hex);
   if (idx !== -1) colors[idx] = { hex, name };   // same hex → replace entry AND its name
   else colors.push({ hex, name });
   ```
   Two different hex values sharing a name are kept as two separate entries.
7. `renderList()` — update the DOM **first** so the new color is visible even if persistence fails.
8. `const saved = persistColors();`
   - `saved === true` → clear the name field, keep the selected color in the picker, show no error.
   - `saved === false` → show a clear error in `#toast` and/or `#validation-message`, e.g. "Could not save to this browser's local storage. Your color is available for this session only." The color **stays in the in-memory list and stays visible**; it is simply not persisted. Do not clear the name field in this case either (so the user can retry). The next successful persist writes the whole current list, including session-only entries.
9. Empty-state visibility updates in `renderList()`.

### 4.3 Render

`renderList()` clears `#color-list` and rebuilds one `<li class="color-item">` per entry:

```html
<li class="color-item">
  <button type="button" class="color-swatch" style="background:#4f46e5" aria-label="Copy hex #4f46e5 for Deep Indigo"></button>
  <span class="name">Deep Indigo</span>
  <code class="hex">#4f46e5</code>
  <button type="button" class="delete-button" aria-label="Delete Deep Indigo">×</button>
</li>
```

- The swatch is a **native `<button>`** — this is what makes Enter and Space work for free (the browser fires `click` for both on a focused button). Do **not** add a `keydown` handler that also copies; that would double-write to the clipboard.
- The hex code is shown as text in the DOM, not only in the `aria-label` — the visible value is what the acceptance criteria check.
- The delete control is a **separate** button from the swatch (spec assumption), so clicking the swatch never deletes and clicking delete never copies.
- Use event delegation on `#color-list` (one `click` listener) rather than per-node listeners, so re-rendering does not leak handlers:
  - if the target is `.color-swatch` → copy `hex`;
  - if the target is `.delete-button` → delete the entry at that `<li>`'s index.

### 4.4 Copy behavior

```js
async function copyHex(hex) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(hex);
    } else {
      legacyCopy(hex); // textarea + document.execCommand('copy') fallback
    }
    showToast('Copied!');
  } catch (err) {
    showToast('Could not copy the hex code. Select and copy it manually.', 4000);
  }
}
```

- `legacyCopy` fallback: create a hidden `<textarea>`, set its value to the hex, `document.execCommand('copy')`, remove the textarea. This keeps the app working when opened from `file://` in browsers that withhold the async clipboard API.
- `showToast(text, ms = 1500)`: clear any pending timer, set `#toast.textContent = text`, unhide it, and hide it again after `ms` via `setTimeout`. The confirmation must be **brief** and must not steal focus.
- After a successful copy the toast reads exactly `Copied!`.

### 4.5 Delete behavior

- Remove the entry from the `colors` array, `renderList()`, then `persistColors()`.
- On persistence failure: show the same clear error as in 4.2 and **keep the entry in the in-memory list**? — No. Decision: on a failed delete write, show the error and **restore the entry in the in-memory list** (so the UI never shows an item that the stored state still contains, which would silently reappear on reload). The toast tells the user the change was not saved. Reverting is the honest behavior and matches "a removed color no longer appears after a successful persisted deletion and page reload" — that criterion is only claimed for *successful* deletions.

### 4.6 Keyboard specifics

- The swatch is focusable and shows a focus ring. With the swatch focused, pressing **Enter** or **Space** triggers a native button `click` → copy. Do not intercept `keydown` for copy.
- Space on a focused native button also scrolls the page in some browsers only if the button's default is prevented; native buttons handle this correctly, so no extra handling is needed.
- The delete button is likewise a native button → keyboard operable for free.
- The form's `submit` event covers pressing Enter inside the name field.

### 4.7 Initialization

```js
document.addEventListener('DOMContentLoaded', () => {
  colors = loadColors();
  renderList();
  // wire form submit + list click delegation
});
```

If `localStorage` was unavailable at load, show a one-time notice in `#toast`: "Browser storage is unavailable — colors will last for this session only." The app still works.

---

## 5. Edge cases to handle

| Case | Behavior |
|---|---|
| Blank / whitespace-only name | Block save, show validation message, focus the name field. |
| Name already used with a different hex | Both entries kept (name duplicates allowed). |
| Same hex saved again | Existing entry replaced in place (position preserved), name updated. |
| `localStorage` throws on read or write | `storageOk = false`; app still saves to the in-memory list; clear error shown; data is session-only. |
| Corrupt JSON in storage | Clear the key, start with an empty list, app continues normally. |
| Clipboard API unavailable or denied | Fallback copy; on total failure show an error toast and keep the hex visible on screen for manual selection. |
| Page reload | `loadColors()` restores the list; deleted entries stay gone. |
| Very long color names | CSS `overflow-wrap: anywhere` / `text-overflow: ellipsis` so the layout does not break. |

---

## 6. Verification the builder must run

No test framework is needed for a single HTML file, but the builder must verify each acceptance criterion and report the result:

1. Open `color-keeper.html` in a browser (and also from `file://` to confirm no server is required).
2. Save with a blank name → validation message appears, nothing added.
3. Pick a color, type a name, save → the entry appears with the name and the exact hex from the picker.
4. Click the swatch → clipboard contains the exact hex; `Copied!` appears briefly.
5. Focus the swatch with the keyboard, press **Enter** → copies. Press **Space** → copies. No double copy, no page scroll on Space.
6. Save the same color again under a different name → the existing entry is replaced (still one entry, new name), not duplicated.
7. Save a different color with the same name as an existing one → two entries appear.
8. Click a delete control → the entry disappears; reload the page → it is still gone.
9. Reload the page → all remaining colors are restored with names and hexes intact.
10. Simulate storage failure (e.g. DevTools → block `localStorage`, or temporarily patch `localStorage.setItem` to throw) → save again → a clear error appears, the new color is visible in the list, and a reload does not contain it.
11. Open DevTools → Network → confirm zero external requests (no CDN, no fonts, no images) and the Elements panel shows a single self-contained file.

Report each criterion as pass/fail. Do not weaken or skip a criterion to claim completion.

---

## 7. Definition of done

- `color-keeper.html` exists in the repo and runs standalone with plain CSS and no external dependencies.
- All 13 acceptance criteria verified by the builder and reported.
- No server, no account, no external network calls, no new paid services.
- Nothing outside `color-keeper.html` is modified. No commit or push unless David explicitly asks.
