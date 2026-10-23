# Plan: Mini To-Do List

## Overview
A simple single-page web application for managing tasks. Users can add tasks, mark them as complete, delete them, and the list persists across page reloads using localStorage.

## Requirements
- Single HTML file, no external frameworks.
- Text input field and an "Add" button to create new tasks.
- Each task should be displayed as an item in a list.
- Clicking a task toggles its completion state (e.g., strike-through or checkbox).
- Each task has a small delete button to remove it.
- Tasks are stored in localStorage and loaded on page load.
- Plain styling, no complex design.

## Acceptance Criteria
- [ ] User can type a task and click Add to add it to the list.
- [ ] User can click a task to toggle its completed status.
- [ ] User can click the delete button to remove a task.
- [ ] Tasks persist after page reload.
- [ ] The app works in a standard browser without any build step.

## Boundaries
- No frameworks or libraries.
- Single HTML file, inline CSS and JavaScript.
- No backend, no server.

## Implementation Plan

### File to create
- `index.html` (single file containing all HTML, CSS, and JavaScript)

### Structure
1. **HTML skeleton** with:
   - `<h1>` heading for the app
   - Input field (`<input type="text">`) for task text
   - "Add" button (`<button>Add</button>`)
   - Unordered list (`<ul>`) to display tasks
   - Each task item (`<li>`) contains:
     - Task text (span)
     - Delete button (`<button>X</button>` or similar)

2. **CSS (inline `<style>`)**:
   - Basic layout: centered container, max-width
   - Task list styling
   - Completed task style (strike-through, reduced opacity)
   - Delete button styling (small, right-aligned)
   - Minimal, clean aesthetic

3. **JavaScript (inline `<script>`)**:
   - `loadTasks()` — read tasks from localStorage and render them on page load
   - `addTask()` — create a new task object, save to localStorage, and update the list
   - `toggleTask(id)` — toggle the completed state of a task, update localStorage, and update the UI
   - `deleteTask(id)` — remove a task from localStorage and update the UI
   - Event listeners for Add button, input field (Enter key), task clicks, and delete button clicks

### Data Model
Each task is an object with:
- `id` — unique identifier (timestamp or UUID)
- `text` — the task description
- `completed` — boolean

Stored in localStorage under a single key, e.g., `todoTasks`, as JSON.

### Key Behaviors
- Pressing Enter in the input field also adds a task (convenience).
- Deleting a task removes it from the list and localStorage.
- Toggling a task visually applies a line-through style and/or changes opacity.
- On page load, tasks are fetched from localStorage and rendered immediately.

### Verification
1. Open `index.html` in a browser.
2. Type a task and click Add — it appears in the list.
3. Click the task text — it toggles strike-through.
4. Click the delete button — the task is removed.
5. Reload the page — all remaining tasks persist.

## Deliverables
- `index.html` — single-file to-do list application.