<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import {
  FolderOpen, Wrench, X,
} from "lucide-vue-next";
import AppShell from "@/components/AppShell.vue";
import OnboardingTour from "@/components/OnboardingTour.vue";
import { getProjectInfo, setTargetDir, stampFactory } from "@/lib/api";
import { nav, type ScreenId } from "@/lib/nav";
import type { TargetProject } from "@shared/types.ts";

import HomeView from "@/views/HomeView.vue";
import NewJobView from "@/views/NewJobView.vue";
import ReviewApproveView from "@/views/ReviewApproveView.vue";
import RunView from "@/views/RunView.vue";
import ResultsView from "@/views/ResultsView.vue";
import SessionsView from "@/views/SessionsView.vue";
import HistoryView2 from "@/views/HistoryView2.vue";
import SettingsView from "@/views/SettingsView.vue";
import HelpView from "@/views/HelpView.vue";

// Tour
import { startTour, tourActive } from "@/lib/tour";

const project = ref<TargetProject | null>(null);
const showSwitchModal = ref(false);
const newProjectPath = ref("");
const switching = ref(false);
const showStampModal = ref(false);
const stamping = ref(false);
const stampLog = ref("");

onMounted(async () => { await refreshProject(); });

async function refreshProject() {
  try {
    project.value = await getProjectInfo();
    if (project.value) newProjectPath.value = project.value.path;
  } catch (e) {
    console.error("Failed to load project info:", e);
  }
}

async function handleSwitchProject() {
  if (!newProjectPath.value.trim()) return;
  try {
    switching.value = true;
    project.value = await setTargetDir(newProjectPath.value.trim());
    showSwitchModal.value = false;
  } catch (e: any) {
    alert("That didn't work. " + e.message);
  } finally {
    switching.value = false;
  }
}

async function handleStampFactory() {
  try {
    stamping.value = true;
    stampLog.value = "Stamping Super Simple Software Factory into target repository…\n";
    const res = await stampFactory(false);
    stampLog.value += res.log;
    await refreshProject();
  } catch (e: any) {
    stampLog.value += `\nError: ${e.message}`;
  } finally {
    stamping.value = false;
  }
}

function openHelp() {
  // If a tour is already active, just switch to Help; otherwise both
  // switch and start the main tour.
  nav.value = { ...nav.value, screen: "help" };
  if (!tourActive.value) startTour("main");
}

// Persist nav.screen across reloads so the user lands where they left off.
const NAV_KEY = "crew.nav";
try {
  const saved = localStorage.getItem(NAV_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed?.screen) nav.value = { ...nav.value, ...parsed };
  }
} catch {}
watch(nav, (v) => {
  try { localStorage.setItem(NAV_KEY, JSON.stringify(v)); } catch {}
}, { deep: true });

// Apply tour data-attributes to nav buttons (so the tour selectors work).
// We do this via a watch on the active screen + a tiny nextTick.
import { nextTick } from "vue";
watch(() => nav.value.screen, async () => {
  await nextTick();
  const map: Record<string, string> = {
    "new-job": "nav-new-job",
    "review-approve": "nav-review",
    "run": "nav-run",
    "sessions": "nav-sessions",
    "settings": "nav-settings",
  };
  // Find the sidebar items and tag them with data-tour attributes.
  document.querySelectorAll(".sidebar-item").forEach((el) => {
    el.removeAttribute("data-tour");
  });
  const cls = (nav.value.screen as ScreenId) && map[nav.value.screen as string];
  if (cls) {
    const items = document.querySelectorAll(".sidebar-item");
    items.forEach((el) => {
      const label = el.textContent?.trim().toLowerCase() ?? "";
      if (cls === "nav-new-job" && label.includes("new job")) el.setAttribute("data-tour", "nav-new-job");
      if (cls === "nav-review" && label.includes("approve")) el.setAttribute("data-tour", "nav-review");
      if (cls === "nav-run" && label.includes("run")) el.setAttribute("data-tour", "nav-run");
      if (cls === "nav-sessions" && label.includes("sessions")) el.setAttribute("data-tour", "nav-sessions");
      if (cls === "nav-settings" && label.includes("settings")) el.setAttribute("data-tour", "nav-settings");
    });
  }
  // Always tag the Help button in the topbar
  document.querySelectorAll(".tour-help-btn").forEach((el, i) => {
    if (i === 0) el.setAttribute("data-tour", "help-btn");
  });
}, { immediate: true });
</script>

<template>
  <AppShell
    :project="project"
    @switch-project="showSwitchModal = true"
    @stamp-factory="showStampModal = true"
    @open-help="openHelp"
  >
    <HomeView v-if="nav.screen === 'home'" />
    <NewJobView v-else-if="nav.screen === 'new-job'" />
    <ReviewApproveView v-else-if="nav.screen === 'review-approve'" />
    <RunView v-else-if="nav.screen === 'run'" />
    <ResultsView v-else-if="nav.screen === 'results'" />
    <SessionsView v-else-if="nav.screen === 'sessions'" />
    <HistoryView2 v-else-if="nav.screen === 'history'" />
    <SettingsView v-else-if="nav.screen === 'settings'" />
    <HelpView v-else-if="nav.screen === 'help'" />

    <!-- Onboarding tour overlay (always mounted; renders when active) -->
    <OnboardingTour />
  </AppShell>

  <!-- SWITCH PROJECT MODAL -->
  <div class="modal-overlay" v-if="showSwitchModal">
    <div class="modal-card">
      <div class="modal-header">
        <h3 style="font-size: 15px; display: flex; align-items: center; gap: 8px;">
          <FolderOpen :size="18" /> Switch target project directory
        </h3>
        <button class="btn btn-ghost btn-xs" @click="showSwitchModal = false"><X :size="16" /></button>
      </div>
      <div class="modal-body">
        <p class="dim" style="font-size: 13px; margin: 0 0 10px;">
          Specify the directory path of the repository you want CREW to operate on. The approval book, profiles, and drafts for this target will load.
        </p>
        <label class="field-label" style="display: block; font-size: 12.5px; font-weight: 600; color: var(--dim); margin-bottom: 4px;">Absolute project path</label>
        <input
          v-model="newProjectPath"
          class="text-input"
          style="font-family: var(--mono);"
          placeholder="e.g. /Users/you/Projects/my-app"
          @keyup.enter="handleSwitchProject"
        />
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;">
          <button class="btn btn-secondary" @click="showSwitchModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="switching || !newProjectPath.trim()" @click="handleSwitchProject">
            {{ switching ? "Switching…" : "Open directory" }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- STAMP FACTORY MODAL -->
  <div class="modal-overlay" v-if="showStampModal">
    <div class="modal-card max-w-xl">
      <div class="modal-header">
        <h3 style="font-size: 15px; display: flex; align-items: center; gap: 8px;">
          <Wrench :size="18" /> Stamp Super Simple Software Factory
        </h3>
        <button class="btn btn-ghost btn-xs" @click="showStampModal = false"><X :size="16" /></button>
      </div>
      <div class="modal-body">
        <p class="dim" style="font-size: 13px; margin: 0 0 10px;">
          This target repository does not currently contain the stamped factory. Clicking stamp executes the official installer:
          <code class="mono" style="display: block; margin-top: 6px; background: var(--panel-3); padding: 4px 8px; border-radius: 4px;">uv run .claude/skills/sssf/scripts/install.py</code>
        </p>
        <div v-if="stampLog" class="mono" style="background: var(--panel-3); border: 1px solid var(--border-soft); padding: 10px; border-radius: var(--radius-sm); font-size: 12px; max-height: 200px; overflow-y: auto; white-space: pre-wrap;">{{ stampLog }}</div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;">
          <button class="btn btn-secondary" @click="showStampModal = false">Close</button>
          <button class="btn btn-primary" :disabled="stamping" @click="handleStampFactory">
            {{ stamping ? "Stamping…" : "Execute install stamp" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
