# Color Keeper — single-page app write-up

## What changed

A new standalone **Color Keeper** app: pick a color, name it, keep it. Click a swatch to
copy its hex code. It is one self-contained HTML file at the repo root — no framework, no
package.json, no build step, no server, no external assets or network calls.

The change is the same shape as the earlier guestbook artifact (plan spec → single HTML
file → manual verification), applied to a different brief: a color palette keeper with
copy-to-clipboard, keyboard-operable swatches, and an explicit story for what happens when
`localStorage` is unavailable.

Two files carry the work, both new:

| File | Role |
|---|---|
| `color-keeper.html` (repo root) | The entire application — markup, inline `<style>`, inline `<script>`. |
| `specs/fa227b12_color-keeper-app.md` (230 lines) | The approved build plan the file followed: element contract, storage rules, save/copy/delete behavior, edge-case table, and a verification checklist. Approval ID `appr-mvh157mkkugr`, version 2, hash `6ad3b0e36bad47c5`. |

`color-keeper.html` is currently **untracked** in git — the diff lists it under
untracked files, so it is not yet committed.

Two unrelated-to-the-app files also changed in the same window: the documenter agent's
prompt template (`.claude/skills/sssf/templates/prompt_engineering/documenter/user.md`
and its copy at `adws/adw_data/prompt_engineering/documenter/user.md`) gained four lines
telling the agent to substitute template variables verbatim and keep write-ups under ~800
words, and `adws/adw_sssf_config/sssf.config.yaml` raised that agent's `max_tokens` from
70000 to 100000. These tune the doc pipeline, not the app.

## How it works

**Save.** The `#color-form` submit handler is the only entry point (button click or Enter
in the name field). A blank or whitespace-only name is blocked: an inline
`#validation-message` appears, the field gets `aria-invalid="true"`, and focus returns to
it. The hex is taken **verbatim** from the `<input type="color">` value so the displayed
code is byte-identical to what the picker produced — no RGB round trip. Entries are keyed
on hex only: saving the same hex again replaces the existing entry in place and updates
its name, while two different hexes sharing a name stay as two entries. The list renders
*before* persistence is attempted, so a new color stays visible even if the write fails.

**List and copy.** `renderList()` rebuilds `#color-list` from scratch. Each row is a
swatch button, the name, a `<code class="hex">` value, and a separate `×` delete button —
separate controls, so copying never deletes and deleting never copies. The swatch is a
native `<button>`, which makes Enter and Space activation free without a `keydown`
handler. A single delegated `click` listener on `#color-list` resolves `.color-swatch`
(copy) or `.delete-button` (delete) via `closest()`, so re-rendering leaks no handlers.
Copy prefers `navigator.clipboard` when `window.isSecureContext` is true and otherwise
falls back to a hidden `<textarea>` plus `document.execCommand('copy')` — which is what
keeps it working from `file://`. Success shows a brief `Copied!` toast (1.5s); failure
shows a "select and copy it manually" message for 4s.

**Delete.** The entry is removed and re-rendered, then persisted. If the write fails, the
entry is **restored** into the list and an error is shown, so the UI never displays an
item that the stored state still contains (which would silently reappear on reload).

## How colors persist

Everything lives in the browser's `localStorage` under the key **`color-keeper.colors`**,
as a JSON array of `{ hex, name }` objects. There is no network call and no server-side
store.

- Per browser and per origin; another browser, another machine, or a private window starts empty.
- Survives refresh and browser restart; cleared with site data.
- `loadColors()` validates on read: corrupt JSON or a non-array payload causes the key to
  be cleared and the app to start empty; individual entries that are not `{hex: string,
  name: string}` with a `^#[0-9a-fA-F]{6}$` hex are dropped.
- If storage access itself throws (private mode, blocked cookies), `storageOk` flips to
  false, the app still works in memory, and a one-time notice says colors will last for
  this session only. A failed save keeps the color visible and does not clear the name
  field, so the user can retry.

## How to open it

Double-click `color-keeper.html` — no tooling, no server, no build. The spec's own
verification steps assume exactly this. If your browser treats `file://` as an opaque
origin and storage misbehaves, serve the folder over plain HTTP instead:

```bash
python -m http.server 8000     # then open http://127.0.0.1:8000/color-keeper.html
```

This file is separate from the C.R.E.W. studio app (`Start-Crew.cmd`, port 4620); the
studio does not serve it.

## How to verify it

The spec's section 6 checklist, as built:

1. Open `color-keeper.html` (and from `file://`) → title, form, and the empty state *"No colors saved yet…"* show.
2. Save with a blank name → validation message appears, nothing added.
3. Pick a color, type a name, save → entry shows the name and the exact picker hex.
4. Click the swatch → clipboard holds the hex, `Copied!` appears briefly.
5. Focus the swatch, press Enter and Space → copies, no double copy, no page scroll.
6. Save the same color under a new name → one entry, updated name (not a duplicate).
7. Save a different color under an existing name → two entries.
8. Delete an entry → it disappears and stays gone after reload.
9. Reload → remaining colors restored with names and hexes intact.
10. Block `localStorage` in DevTools, save again → clear error appears, the color is visible in the list, and a reload does not contain it.
11. DevTools → Network → zero external requests; Elements shows a single self-contained file.

## Notes for the next engineer

- **Spec vs. build deviations, all cosmetic.** The spec's skeleton nested inputs inside `<label class="field">`; the build uses explicit `for`/`id` pairs with the label text in a `<span>`. The build also adds a dedicated `#storage-message` element (the spec allowed "toast and/or validation message") and puts `#toast` as a sibling of `<main>` rather than inside it. The spec's own HTML skeleton and JS snippets were sketches; the built file is authoritative.
- **Two rough edges in the spec text.** Section 4.5 contains a self-corrected line ("…keep the entry in the in-memory list**? — No. Decision: …") left from editing. Section 7 claims "13 acceptance criteria", but section 6 lists 11 verification steps.
- **Storage key** `color-keeper.colors` is defined once at the top of the script; it is the only handle you need to inspect or wipe the data.
- **Not a shared palette.** Local storage means this file cannot act as a multi-device palette without a server component — which the spec's constraints explicitly rule out.
