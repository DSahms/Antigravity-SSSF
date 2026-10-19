# Plan: Single-Page Guestbook

## Overview
Create a lightweight, single-file HTML guestbook where visitors can submit a name and message, stored in browser `localStorage`, with timestamps, character limits, a demo notice, and no external build steps or dependencies.

## Target File
- `index.html` (at the root of the repo, or a dedicated directory if requested, but root `index.html` is cleanest for a single-file guestbook that can be opened directly). Let's place it at root as `index.html` (or `guestbook.html` if root index has another purpose — let's check root files first).

Wait, let's check what root files exist: `README.md`, `specs/`, `studio/`, etc. There is no `index.html` at root. Placing `index.html` at root is standard and allows direct browser opening.

## Detailed Requirements & Implementation Steps

### 1. Structure & Layout (`index.html`)
- Single HTML5 file containing embedded `<style>` and `<script>`.
- Responsive, clean, minimal styling (system sans-serif fonts, comfortable padding, simple form layout, clean cards/list for entries).
- Visible demo notice banner or alert: `"Demo: entries only saved in your browser."`

### 2. Form Inputs & Validation
- **Name input**: `<input type="text" id="guest-name" maxlength="50" required placeholder="Your name">`
- **Message input**: `<textarea id="guest-message" maxlength="200" required placeholder="Leave a short message..."></textarea>`
- **Submit button**: `<button type="submit">Sign Guestbook</button>`
- Simple length checks & non-empty trimming in JavaScript before saving.

### 3. LocalStorage & State Management
- Key: `'crew_guestbook_entries'`
- Data structure: JSON array of objects:
  ```json
  [
    {
      "id": "uuid-or-timestamp",
      "name": "Alice",
      "message": "Hello world!",
      "timestamp": "2026-10-19T23:00:00.000Z"
    }
  ]
  ```
- Functions needed:
  - `loadEntries()`: reads from `localStorage`, parses JSON, returns array.
  - `saveEntry(name, message)`: validates, creates entry object with current ISO/local timestamp, unshifts/pushes to array, saves back to `localStorage`.
  - `renderEntries()`: clears current list DOM, renders each entry with formatted timestamp, name, and message.

### 4. Timestamp & UI Polish
- Format timestamps nicely (e.g. `toLocaleString()` or relative time / clean date string).
- Empty state: display a friendly message when no entries exist yet (e.g., "No entries yet. Be the first to sign!").
- Character count indicators (optional bonus or simple HTML `maxlength` attribute which natively enforces limits).

## Verification Plan
1. Open `index.html` directly in a browser (or via local static check / test script if needed, but since no build system is required, file existence and correct HTML/JS syntax).
2. Verify acceptance criteria:
   - Name (max 50) and Message (max 200) limits enforced via HTML `maxlength` and JS checks.
   - Submitting adds entry instantly to the DOM list and persists in `localStorage`.
   - Timestamps display correctly.
   - Demo notice is visible.
   - Zero external frameworks or build steps.
