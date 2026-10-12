/**
 * App navigation store — a single source of truth for the active screen.
 *
 * The main path (Home → New Job → Review & Approve → Run → Results) is a
 * linear sequence; Settings/Sessions/History/Help are separate areas. The
 * store tracks both the active route and any parameter passed between
 * screens (e.g. a preselected spec path, approval id, run id, adw id).
 */
import { computed, ref } from "vue";

export type ScreenId =
  | "home"
  | "new-job"
  | "review-approve"
  | "run"
  | "results"
  | "sessions"
  | "history"
  | "settings"
  | "help";

export interface NavState {
  screen: ScreenId;
  specPath?: string;
  approvalId?: string;
  runId?: string;
  adwId?: string;
}

export const nav = ref<NavState>({ screen: "home" });

export const MAIN_FLOW: ScreenId[] = [
  "new-job",
  "review-approve",
  "run",
  "results",
];

export function stepNumber(screen: ScreenId): number | null {
  const idx = MAIN_FLOW.indexOf(screen);
  return idx === -1 ? null : idx + 1;
}

export function screenName(screen: ScreenId): string {
  switch (screen) {
    case "home": return "Home";
    case "new-job": return "New Job";
    case "review-approve": return "Review and Approve";
    case "run": return "Run";
    case "results": return "Results";
    case "sessions": return "Sessions";
    case "history": return "History";
    case "settings": return "Settings";
    case "help": return "Help";
  }
}

export function screenPurpose(screen: ScreenId): string {
  switch (screen) {
    case "home": return "Start here. See your drafts, recent runs, and the main path at a glance.";
    case "new-job": return "Describe what you want done. Talk it through, upload a file, or paste text.";
    case "review-approve": return "Confirm each section, read what will happen, and approve. Nothing runs without your approval.";
    case "run": return "Watch the job run live. Pause or stop anytime. Token usage is guarded.";
    case "results": return "See what changed, what passed, and what to do next.";
    case "sessions": return "Inspect every run as a trace — phases, agents, tool calls, gates, envelopes.";
    case "history": return "The audit log of every approved specification.";
    case "settings": return "Connect model profiles per role. Local is the default. Cloud is optional.";
    case "help": return "Take the tour again, read the glossary, and find your way around.";
  }
}

export function go(screen: ScreenId, params?: Partial<NavState>) {
  nav.value = { screen, ...params };
  // Scroll main area to top on screen change
  queueMicrotask(() => {
    const main = document.querySelector(".app-main");
    if (main) main.scrollTop = 0;
  });
}

export const currentScreen = computed(() => nav.value.screen);
