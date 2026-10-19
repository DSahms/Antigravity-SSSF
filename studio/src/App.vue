<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import {
  FolderOpen, Wrench, X,
} from "lucide-vue-next";
import AppShell from "@/components/AppShell.vue";
import OnboardingTour from "@/components/OnboardingTour.vue";
import { getProjectInfo, setTargetDir, stampFactory, createProject } from "@/lib/api";
import { nav } from "@/lib/nav";
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
const projectName = ref("");
const recentProjects = ref<string[]>([]);
try { const saved = JSON.parse(localStorage.getItem("crew.projects") || "[]"); if (Array.isArray(saved)) recentProjects.value = saved.filter(p => typeof p === "string"); } catch {}
function rememberProject(path: string) {
  recentProjects.value = [...new Set([path, ...recentProjects.value])].slice(0, 20);
  localStorage.setItem("crew.projects", JSON.stringify(recentProjects.value));
}
async function handleCreateProject() {
  if (!projectName.value.trim() || switching.value) return;
  switching.value = true;
  try { project.value = await createProject(projectName.value.trim()); rememberProject(project.value.path); nav.value = { screen: "new-job" }; showSwitchModal.value = false; }
  catch (error: any) { alert(error.message); }
  finally { switching.value = false; }
}

onMounted(async () => { await refreshProject(); });

async function refreshProject() {
  try {
    project.value = await getProjectInfo();
    if (project.value) newProjectPath.value = project.value.path;
    if (project.value) rememberProject(project.value.path);
  } catch (e) {
    console.error("Failed to load project info:", e);
  }
}

async function handleSwitchProject() {
  if (!newProjectPath.value.trim()) return;
  try {
    switching.value = true;
    project.value = await setTargetDir(newProjectPath.value.trim());
    rememberProject(project.value.path);
    nav.value = { screen: "home" };
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
    stampLog.value = "Stamping Crew workflow engine into target repository…\n";
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
        <label for="crew-new-project">Create a separate app project</label>
        <input id="crew-new-project" v-model="projectName" placeholder="my-app" />
        <button class="btn btn-primary" :disabled="switching || !projectName.trim()" @click="handleCreateProject">Create project</button>
        <label for="crew-saved-project">Or choose a saved project</label>
        <select id="crew-saved-project" v-model="newProjectPath"><option v-for="path in recentProjects" :key="path" :value="path">{{ path }}</option></select>
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
          <Wrench :size="18" /> Stamp Crew workflow engine
        </h3>
        <button class="btn btn-ghost btn-xs" @click="showStampModal = false"><X :size="16" /></button>
      </div>
      <div class="modal-body">
        <p class="dim" style="font-size: 13px; margin: 0 0 10px;">
          This target repository does not currently contain the stamped factory. Clicking stamp executes the official installer:
          Crew will prepare the workflow files in this project without replacing existing files.
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
