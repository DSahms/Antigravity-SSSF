<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  ChevronLeft, ChevronRight, Minus, RotateCcw, X,
} from "lucide-vue-next";
import {
  clearHighlight, currentStep, endTour, nextStep, positionBubble,
  prevStep, shouldDock, skipTour, startTour, tourActive, tourCollapsed,
  tourIndex, type TourId,
} from "@/lib/tour";

const bubbleEl = ref<HTMLElement | null>(null);
const arrowEl = ref<HTMLElement | null>(null);
const docked = ref(false);
let cleanup: (() => void) | null = null;
let dockObserver: ResizeObserver | null = null;

const total = computed(() => (tourActive.value === "firstrun" ? 3 : 6));

async function attach() {
  cleanup?.();
  cleanup = null;
  clearHighlight();

  if (!currentStep.value) return;

  // Wait for DOM to reflect the new screen (if a step navigates).
  await nextTick();
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  const step = currentStep.value;
  const targetEl = step.target ? document.querySelector<HTMLElement>(step.target) : null;

  if (step.target && !targetEl) {
    // Graceful skip — target can't be found.
    nextStep();
    return;
  }

  // Highlight the target IMMEDIATELY, independent of whether the bubble
  // is fully rendered yet. The highlight is the source of truth the tour
  // overlap test uses.
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    targetEl.classList.add("tour-target-highlight");
  }

  docked.value = shouldDock();
  await nextTick();

  // If the bubble isn't rendered yet, wait one more frame. (Vue's v-if
  // has just become true; the ref needs a tick to populate.)
  if (!bubbleEl.value) {
    await nextTick();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }

  if (bubbleEl.value) {
    cleanup = positionBubble(
      bubbleEl.value,
      arrowEl.value,
      targetEl as HTMLElement | null,
      step.placement,
      docked.value,
    );
  }
}

watch(
  () => [tourActive.value, tourIndex.value, tourCollapsed.value],
  () => {
    if (tourActive.value && !tourCollapsed.value) attach();
    else { cleanup?.(); cleanup = null; clearHighlight(); }
  },
  { immediate: true },
);

// Re-dock on resize.
dockObserver = new ResizeObserver(() => {
  if (tourActive.value && !tourCollapsed.value) attach();
});
dockObserver.observe(document.documentElement);

// Reposition on scroll (Floating UI's autoUpdate already does this when
// target is present; for the no-target center case we reposition on resize
// only, which is fine).
window.addEventListener("scroll", onScroll, { passive: true, capture: true });
function onScroll() { /* autoUpdate handles target case; no-op here */ }

onBeforeUnmount(() => {
  cleanup?.();
  clearHighlight();
  dockObserver?.disconnect();
  window.removeEventListener("scroll", onScroll, { capture: true } as any);
});

function handleSkip() { skipTour(); }
function handleRestart() {
  const id: TourId = tourActive.value ?? "main";
  startTour(id);
}
function handleCollapse() {
  tourCollapsed.value = true;
  cleanup?.();
  clearHighlight();
}
function handleExpand() {
  tourCollapsed.value = false;
}
</script>

<template>
  <!-- COLLAPSED CHIP -->
  <button
    v-if="tourActive && tourCollapsed"
    class="tour-chip"
    @click="handleExpand"
    aria-label="Expand tour"
  >
    <Minus :size="14" />
    Tour paused — step {{ tourIndex + 1 }} of {{ total }}. Click to resume.
  </button>

  <!-- BUBBLE -->
  <div
    v-if="tourActive && !tourCollapsed"
    ref="bubbleEl"
    class="tour-bubble"
    :class="{ 'tour-docked': docked }"
    role="dialog"
    aria-live="polite"
  >
    <div ref="arrowEl" class="tour-arrow" v-if="!docked"></div>

    <div class="tour-title">{{ currentStep?.title }}</div>
    <div class="tour-what">{{ currentStep?.what }}</div>
    <div class="tour-why">{{ currentStep?.why }}</div>
    <div v-if="currentStep?.example" class="tour-example">
      {{ currentStep.example }}
    </div>

    <div class="tour-controls">
      <span class="tour-progress">Step {{ tourIndex + 1 }} of {{ total }}</span>
      <div class="tour-actions">
        <button
          v-if="tourIndex > 0"
          class="btn btn-ghost btn-xs"
          @click="prevStep"
          title="Back"
        >
          <ChevronLeft :size="14" />
          Back
        </button>
        <button
          class="btn btn-ghost btn-xs"
          @click="handleCollapse"
          title="Collapse to chip"
        >
          <Minus :size="14" />
        </button>
        <button
          class="btn btn-ghost btn-xs"
          @click="handleRestart"
          title="Restart tour"
        >
          <RotateCcw :size="14" />
        </button>
        <button
          class="btn btn-ghost btn-xs"
          @click="handleSkip"
          title="Skip"
        >
          <X :size="14" />
          Skip
        </button>
        <button
          class="btn btn-primary btn-xs"
          @click="nextStep"
          :title="tourIndex === total - 1 ? 'Finish' : 'Next'"
        >
          {{ tourIndex === total - 1 ? "Done" : "Next" }}
          <ChevronRight v-if="tourIndex !== total - 1" :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour-docked {
  position: fixed !important;
  bottom: 16px !important;
  left: 16px !important;
  right: 16px !important;
  top: auto !important;
  max-width: none !important;
  transform: none !important;
}
</style>
