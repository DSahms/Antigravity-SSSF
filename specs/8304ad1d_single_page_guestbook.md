# Plan: Single-Page Guestbook

## Overview
Create a single HTML file that implements a guestbook with form inputs, localStorage persistence, and a display list. All logic is vanilla JavaScript with minimal CSS.

## Files to Create
- `guestbook.html` — Single-file solution with embedded CSS and JS

## Implementation Steps

### 1. HTML Structure
Create `guestbook.html` with:
- `<header>` containing the title and demo notice
- `<form>` with:
  - `<input type="text" id="name" maxlength="50" placeholder="Your name">`
  - `<textarea id="message" maxlength="200" placeholder="Your message">`
  - `<button type="submit">Submit</button>`
- `<ul id="guestbook-list">` for displaying entries

### 2. CSS Styling
Embed minimal CSS in `<style>`:
- Centered layout with max-width container
- Readable fonts (system-ui, sans-serif)
- Form styling: padding, borders, hover effects
- List styling: spacing, indentation, timestamp styling
- Demo notice in light gray background with warning icon

### 3. JavaScript Logic
Embed in `<script>`:
- Form submit handler:
  - Prevent default submission
  - Get values from name and message inputs
  - Validate: both fields required, name ≤ 50 chars, message ≤ 200 chars
  - Show inline validation errors if needed
- Entry creation:
  - Generate timestamp string (`YYYY-MM-DD HH:mm`)
  - Create object `{ name, message, timestamp }`
  - Store in localStorage key `guestbook_entries` (array of objects)
  - Clear form after successful submission
  - Re-render the list
- List rendering:
  - Read from localStorage (parse JSON)
  - Clear current list
  - For each entry: create `<li>` with name, message, timestamp
  - Prepend newest entries to top

### 4. Demo Notice
Add visible note: "Demo: entries only saved in your browser."

## Verification Steps
- Open `guestbook.html` in a browser
- Enter a name and message (both required)
- Submit — entry appears in list with timestamp
- Refresh page — entry persists via localStorage
- Verify character limits work (max 50 name, max 200 message)
- Confirm no external libraries or build steps used

## Constraints
- Single HTML file only
- No server-side code
- No frameworks (React, Vue, etc.)
- No external CSS/JS files
- Vanilla JavaScript only
