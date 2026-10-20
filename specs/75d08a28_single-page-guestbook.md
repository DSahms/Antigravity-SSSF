# Single-Page Guestbook

## Goal
Create a lightweight, single-page web form where visitors can sign their name and leave a short message. All entries are stored locally in the browser and displayed in a list on the same page.

## Requirements
- **Single file**: One HTML document containing all markup, CSS, and JavaScript.
- **Plain styling**: No framework, minimal CSS to keep the UI readable.
- **Form**: Input fields for *Name* (max 50 characters) and *Message* (max 200 characters). Submit button.
- **Entry list**: Display all stored entries on the page.
- **Storage**: Persist entries in `localStorage`; data is visible only to the current browser.
- **Demo notice**: A clear, visible note stating "Demo: entries only saved in your browser."
- **Timestamp**: Each entry shows when it was added.
- **No build step**: The file can be opened directly in a browser.

## Acceptance Criteria
- [ ] User can enter a name and message (with the specified character limits).
- [ ] User can submit the entry; the entry appears immediately in the list.
- [ ] The list shows all entries stored in `localStorage`.
- [ ] Each entry includes a timestamp.
- [ ] The page contains a visible note explaining that entries are browser‑only.
- [ ] The page is a single `.html` file with embedded CSS/JS.
- [ ] No external build tooling or frameworks are required.

## Boundaries
- **No server**: All data lives locally; no cross‑user persistence.
- **No advanced UI**: Keep the design minimal and functional.
- **No complex validation**: Basic length checks are sufficient.
- **No external libraries**: Vanilla JavaScript only.
- **No build system**: The file runs as‑is in any modern browser.

## Implementation Plan

### File to Create
- `single-page-guestbook.html` (in project root)

### HTML Structure
1. **Header**: Title and demo notice
2. **Form Section**:
   - Input: Name (text, max 50 chars)
   - Input: Message (textarea, max 200 chars)
   - Button: Submit
3. **List Section**: Container for guestbook entries

### CSS (embedded)
- Centered layout with max-width container
- Clear separation between form and list
- Readable typography (sans-serif)
- Subtle borders and spacing
- Responsive design (mobile-friendly)

### JavaScript (embedded)
1. **State Management**:
   - Load entries from `localStorage` on page load
   - Function to save entries to `localStorage`

2. **Form Handling**:
   - Listen for submit event
   - Validate input lengths (max 50 for name, 200 for message)
   - Prevent default form submission
   - Create entry object with name, message, timestamp
   - Append to list and update storage

3. **Display Logic**:
   - Function to render all entries from storage
   - Format timestamp as readable date/time
   - Clear list before re-rendering (or append new entry)

4. **Entry Rendering**:
   - Each entry: name, message, timestamp
   - Truncate long messages if needed (optional, not required)
   - Delete button per entry (nice-to-have, not required)

### Validation Rules
- Name: `value.length <= 50`
- Message: `value.length <= 200`
- Show inline error if limits exceeded

### Testing Checklist
1. Open `single-page-guestbook.html` in browser
2. Enter name (50 chars max) and message (200 chars max)
3. Submit and verify entry appears immediately
4. Refresh page and verify entries persist in `localStorage`
5. Check timestamp format is readable
6. Verify demo notice is visible
7. Test with empty name/message (should be allowed)
8. Test with name/message at character limits

### No Build Required
- File is standalone HTML with embedded CSS/JS
- No Node.js, Bun, or Python needed to run
- Double-click to open in any modern browser

## Notes for Builder
- Use vanilla JavaScript — no frameworks
- Store entries as array of objects in `localStorage`
- Key name: `guestbook_entries`
- Entry format: `[{ name, message, timestamp }]`
- Timestamp: use `new Date().toISOString()` or `toLocaleString()`
- CSS should be minimal but readable
- No server-side code needed
