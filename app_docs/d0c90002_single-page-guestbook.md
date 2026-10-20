# Single-Page Guestbook — write-up

## What was built

A complete guestbook that lives in **one HTML file** with no server, no build step, no
framework, and no external files. Open the file and it works: a sign-in form, inline
validation, and a list of entries that survives a page refresh.

The point of the change is a self-contained reference artifact — the smallest end-to-end
slice of the C.R.E.W. Software factory's build path (plan spec → single HTML file →
manual verification) with every moving part visible in one screen.

Two files carry it, both new:

| File | Role |
|---|---|
| `guestbook.html` (repo root, 295 lines) | The whole application — HTML structure, embedded CSS, embedded vanilla JS. |
| `specs/8304ad1d_single_page_guestbook.md` | The plan the build followed: files to create, implementation steps, verification steps, constraints. |

## How it works

**Markup.** A `<header>` carries the `Guestbook` title and a demo notice reading
*"Demo: entries only saved in your browser."* Below it, `#guestbook-form` holds a name
`<input>` (`maxlength="50"`, `required`), a message `<textarea>` (`maxlength="200",
`required`), and a `Submit` button. Each field has a paired hidden error element
(`#name-error`, `#message-error`) that the script reveals on failure. The rendered list is
`<ul id="guestbook-list">`.

**Validation.** The submit handler trims both inputs, clears the visible error state,
then checks required and length. Failures set `.visible` on the matching error element
and abort the submission. The HTML `maxlength` attributes already stop over-long input
in the browser, so the JavaScript length branches are a backstop.

**Entry creation.** A successful submit builds `{ name, message, timestamp }`. The
timestamp comes from `new Date().toISOString()` with the `T` swapped for a space and
truncated — i.e. `YYYY-MM-DD HH:mm` in **UTC**, not local time. The entry is pushed onto
the stored array, the form is cleared, and the list re-renders.

**Rendering.** `renderEntries()` parses the stored array, empties the list, and rebuilds
it with `document.createElement` + `textContent`. Two consequences worth knowing: entry
text is never parsed as HTML (so a name or message containing markup displays literally
rather than executing), and `entries.reverse()` puts the newest entry at the top. When
there are no entries, a single italic list item reads *"No entries yet. Be the first to
sign!"* `renderEntries()` also runs once on page load, so stored entries appear
immediately.

## How entries persist

Everything lives in the browser's **`localStorage`** under the key **`guestbook_entries`**,
as a JSON array of `{ name, message, timestamp }` objects. There is no network call and
no server-side store.

Practical consequences:

- Entries are **per browser and per origin**. Another browser, another machine, or a
  private window starts empty.
- Entries **survive refresh and browser restart**, and are **removed** when site data is
  cleared.
- Clearing the key wipes the guestbook: `localStorage.removeItem('guestbook_entries')` in
  the browser console, then reload.

## How to open it

Double-click `guestbook.html` — no tooling required, and the spec's own verification
steps assume exactly this. If your browser treats `file://` as an opaque origin, serve
the folder over plain HTTP instead so storage is stable across reloads:

```bash
python -m http.server 8000     # then open http://127.0.0.1:8000/guestbook.html
```

Note that the C.R.E.W. studio app (`Start-Crew.cmd`, port 4620) is a separate thing from
this file; the guestbook is standalone and is not served by it.

## How to verify it

The spec's verification list, as implemented:

1. Open `guestbook.html` in a browser → title, demo notice, and empty state
   *"No entries yet. Be the first to sign!"* are visible.
2. Submit with the name blank → `#name-error` becomes visible; nothing is stored.
3. Submit with a valid name and message → the entry appears at the top of the list with
   a `YYYY-MM-DD HH:mm` timestamp, and both fields clear.
4. Reload the page → the entry is still there (that is the localStorage round trip).
5. Try a name over 50 characters or a message over 200 → the input is capped by the
   `maxlength` attribute; the JavaScript error branch is the backstop.
6. Inspect the store → `JSON.parse(localStorage.getItem('guestbook_entries'))` returns the
   array of entry objects.
7. Confirm the constraints hold → no network requests, no external `<link>`/`<script>`
   references, no build artifacts required.

## Notes for the next engineer

- **Spec vs. build deviation (cosmetic).** The spec asked for a demo notice with a
  *"light gray background with warning icon"*. The implementation uses an amber notice
  (`#fff3cd` background, `#ffc107` left border) and contains **no icon**. Everything
  else in the spec — field ids, limits, storage key, timestamp format, constraints — is
  present as written.
- **Sticky error wording.** When the too-long branch fires, it rewrites the error
  element's `textContent` (*"Name must be 50 characters or less"*) and never restores
  the original *"Name is required (max 50 characters)"*. The handler only removes the
  `visible` class to reset errors, not the text, so the wording change persists for the
  rest of the session. Harmless, but it is why a later empty-field error can read
  oddly.
- **UTC timestamps.** The displayed time is UTC while the browser is on local time. If
  local time is wanted, the timestamp has to be built from local getters instead of
  `toISOString()`.
- **Not a shared guestbook.** Because storage is local, this file cannot act as a
  multi-visitor guestbook without a server component — which the spec's constraints
  explicitly rule out.
