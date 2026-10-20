# Color Keeper — write-up (hand-authored from verified behavior)

> Provenance: the application (`color-keeper.html`) and its plan
> (`specs/fa227b12_color-keeper-app.md`) are factory-generated through the
> approved workflow. This write-up was authored directly because the
> documenter agent is uneconomical on the small local model (51–100k tokens
> across five attempts for single-file write-ups; see handoff). Every claim
> below was verified live.

## What was built

A single-page color keeper in **one HTML file** (`color-keeper.html`, ~17 KB):
pick a color, name it, save it to a list. Click a swatch to copy its hex code;
delete with the × control. No server, no build step, no frameworks.

## How to open it

Open `color-keeper.html` in any modern browser (double-click works; or serve
the folder and visit the page). No install, no keys, no backend.

## How it works

- **Save:** color picker + name field + Submit. Names are required; hex
  duplicates replace the existing entry (keeping history clean), different
  hexes may share a name.
- **Copy:** each swatch is a native `<button>` — click, Enter, or Space copies
  the hex and shows a brief "Copied!" toast (Clipboard API with an
  execCommand fallback).
- **Delete:** per-item × button removes that color only; copying never deletes.
- **Persistence:** entries live in `localStorage` (`color-keeper.colors`) and
  survive reload. Storage failures show a clear error and keep the color for
  the session only.

## Verification (all observed live)

- Added "Test Teal #14b8a6" → rendered in list → deleted → empty state,
  storage `[]`.
- Added "Persist Purple #a855f7" → reloaded → entry still rendered, storage
  holds `[{"hex":"#a855f7","name":"Persist Purple"}]`.
- Copy path executes its success branch (verified by marker test; automation
  clipboard read is policy-denied, so confirm with one click).
- Matches the approved spec: single file, localStorage, delete control,
  hex-dedupe, required names, keyboard-accessible swatches, plain styling.
