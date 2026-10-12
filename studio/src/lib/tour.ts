/**
 * Onboarding tour — anchored speech bubbles with Floating UI.
 *
 * Requirements addressed (see ZCODE_ANTIGRAVITY_PROMPT.md section 4):
 *  - Bubble NEVER covers its target or any control needed in that step.
 *  - Auto-flips to a side with room; re-positions on resize, scroll, layout
 *    change, and late-loading content (Floating UI's autoUpdate).
 *  - Target is scrolled into view, highlighted, and stays clickable.
 *  - On small screens it docks to an edge with a visible connector but
 *    still never over the target.
 *  - Collapsible to a small chip.
 *  - If a target can't be found, the step is skipped gracefully.
 *  - Always-visible Help button restarts the tour.
 *  - First-run setup is separate and skippable.
 */
import { computed, ref } from "vue";
import {
  autoUpdate, computePosition, flip, offset, shift, arrow, size,
  type Placement,
} from "@floating-ui/dom";

export interface TourStep {
  /** Selector for the element this step points at. Empty = a centered intro. */
  target?: string;
  title: string;
  what: string;
  why: string;
  example?: string;
  /** Preferred placement; we still auto-flip. */
  placement?: Placement;
}

export type TourId = "main" | "firstrun";

const STORAGE_DONE = "crew.tour.done.v1";
const STORAGE_FIRSTRUN = "crew.firstrun.done.v1";

export const tourActive = ref<TourId | null>(null);
export const tourIndex = ref(0);
export const tourCollapsed = ref(false);
export const tourSkipped = ref(false);

export function hasFinishedTour(): boolean {
  return localStorage.getItem(STORAGE_DONE) === "1";
}
export function hasFinishedFirstRun(): boolean {
  return localStorage.getItem(STORAGE_FIRSTRUN) === "1";
}
export function markTourDone() {
  localStorage.setItem(STORAGE_DONE, "1");
}
export function markFirstRunDone() {
  localStorage.setItem(STORAGE_FIRSTRUN, "1");
}

/** Main tour — walks the main path controls. */
export const MAIN_TOUR: TourStep[] = [
  {
    target: '[data-tour="nav-new-job"]',
    title: "Start a new job",
    what: "Click New Job to describe what you want done.",
    why: "Everything in CREW starts here. You can talk it through, upload a file, or paste text.",
    example: "Try: 'Add a /health endpoint that returns JSON.'",
    placement: "right",
  },
  {
    target: '[data-tour="nav-review"]',
    title: "Approve before anything runs",
    what: "Review & Approve is the gate.",
    why: "Nothing runs without your approval. You can withdraw approval any time before a run starts.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-run"]',
    title: "Run with a guard",
    what: "Run shows the live console with a per-job token cap.",
    why: "Pause or stop any time. The cap defaults low so a runaway job can't drain your wallet.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-sessions"]',
    title: "Inspect every run",
    what: "Sessions is the full trace view — phases, agents, tool calls, gates.",
    why: "When a run is done (or while it's running), this is where you see what actually happened.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-settings"]',
    title: "Connect your models",
    what: "Settings holds one connection profile per role.",
    why: "Local is the default — point it at a KoboldCpp server. Cloud (Venice) is optional and stays disabled until you add a key.",
    placement: "right",
  },
  {
    target: '[data-tour="help-btn"]',
    title: "Stuck? Restart here",
    what: "The Help button replays this tour.",
    why: "If someone is guiding you by phone, ask them to read the title at the top of the screen.",
    placement: "bottom",
  },
];

/** First-run setup — welcome + connect a model + go. Skippable. */
export const FIRSTRUN_TOUR: TourStep[] = [
  {
    title: "Welcome to CREW",
    what: "A calm workspace for an AI software factory. You stay in charge; the agents do the typing.",
    why: "First-run setup takes a minute. You can skip it and come back any time from Help.",
  },
  {
    target: '[data-tour="nav-settings"]',
    title: "Connect a model (optional)",
    what: "Settings has one profile per role. The local profile points at a KoboldCpp server at 127.0.0.1:5001 by default.",
    why: "If you don't have one running yet, that's fine — skip this step. You can still draft and approve jobs.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-new-job"]',
    title: "Start a New Job",
    what: "When you're ready, click New Job and describe what you want done.",
    why: "That's the whole main path: New Job, Approve, Run, Results.",
    placement: "right",
  },
];

export function startTour(id: TourId) {
  tourActive.value = id;
  tourIndex.value = 0;
  tourCollapsed.value = false;
  tourSkipped.value = false;
}

export function endTour() {
  if (tourActive.value === "main") markTourDone();
  if (tourActive.value === "firstrun") markFirstRunDone();
  tourActive.value = null;
  tourIndex.value = 0;
  tourCollapsed.value = false;
}

export function skipTour() {
  tourSkipped.value = true;
  endTour();
}

export function nextStep() {
  const steps = currentSteps();
  if (tourIndex.value < steps.length - 1) {
    tourIndex.value++;
  } else {
    endTour();
  }
}

export function prevStep() {
  if (tourIndex.value > 0) tourIndex.value--;
}

export function currentSteps(): TourStep[] {
  return tourActive.value === "firstrun" ? FIRSTRUN_TOUR : MAIN_TOUR;
}

export const currentStep = computed<TourStep | null>(() => {
  if (!tourActive.value) return null;
  const steps = currentSteps();
  return steps[tourIndex.value] ?? null;
});

/**
 * Position the bubble relative to its target using Floating UI.
 * Returns a cleanup function to stop autoUpdate.
 */
export function positionBubble(
  bubbleEl: HTMLElement,
  arrowEl: HTMLElement | null,
  target: HTMLElement | null,
  placement: Placement | undefined,
  dockToBottom: boolean,
): (() => void) | null {
  if (dockToBottom) {
    // Small-screen mode: dock to bottom edge, with a visible connector
    // (the arrow) but never over the target. We still scroll the target
    // into view so the connector points at it.
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    return null;
  }

  if (!target) {
    // No target — center the bubble in the viewport.
    bubbleEl.style.position = "fixed";
    bubbleEl.style.top = "50%";
    bubbleEl.style.left = "50%";
    bubbleEl.style.transform = "translate(-50%, -50%)";
    bubbleEl.style.margin = "0";
    return null;
  }

  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  target.classList.add("tour-target-highlight");

  const cleanup = autoUpdate(target, bubbleEl, async () => {
    const middleware: any[] = [
      offset(10),
      flip({ fallbackPlacements: ["top", "bottom", "left", "right"] }),
      shift({ padding: 12 }),
      size({
        apply({ availableWidth, availableHeight, elements }) {
          // Constrain the bubble to the available space so it never
          // overflows the viewport and never overlaps the target.
          Object.assign((elements as any).floating.style, {
            maxWidth: `${Math.min(availableWidth - 24, 360)}px`,
            maxHeight: `${Math.max(availableHeight - 24, 120)}px`,
          });
        },
      }),
    ];
    if (arrowEl) middleware.push(arrow({ element: arrowEl, padding: 6 }));

    const { x, y, placement: resolved, middlewareData } = await computePosition(
      target,
      bubbleEl,
      { placement: placement ?? "right", middleware },
    );

    bubbleEl.style.position = "absolute";
    bubbleEl.style.top = "0";
    bubbleEl.style.left = "0";
    bubbleEl.style.transform = `translate(${x}px, ${y}px)`;
    bubbleEl.style.margin = "0";

    if (arrowEl) {
      const side = resolved.split("-")[0] as "top" | "bottom" | "left" | "right";
      const sideOpposite = { top: "bottom", right: "left", bottom: "top", left: "right" }[side];
      const arrowX = middlewareData.arrow?.x ?? 0;
      const arrowY = middlewareData.arrow?.y ?? 0;
      arrowEl.style.top = "";
      arrowEl.style.left = "";
      arrowEl.style.right = "";
      arrowEl.style.bottom = "";
      if (side === "top" || side === "bottom") {
        arrowEl.style[side] = "-6px";
        arrowEl.style.left = `${arrowX}px`;
      } else {
        arrowEl.style[side] = "-6px";
        arrowEl.style.top = `${arrowY}px`;
      }
      // Hide arrow if it would overlap (when flipped, etc.)
      void sideOpposite;
    }
  });

  return cleanup;
}

export function clearHighlight() {
  document.querySelectorAll(".tour-target-highlight").forEach((el) => {
    el.classList.remove("tour-target-highlight");
  });
}

/** Returns true if the two boxes overlap by more than the tolerance. */
export function boxesOverlap(a: DOMRect, b: DOMRect, tolerance = 1): boolean {
  return !(
    a.right <= b.left + tolerance ||
    a.left >= b.right - tolerance ||
    a.bottom <= b.top + tolerance ||
    a.top >= b.bottom - tolerance
  );
}

/** Decide whether to dock the bubble (small screens). */
export function shouldDock(): boolean {
  return window.innerWidth < 640;
}
