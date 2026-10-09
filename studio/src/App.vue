<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Compass,
  FolderGit2,
  FolderOpen,
  GitBranch,
  History,
  Layers,
  Radio,
  Sliders,
  Sparkles,
  Wrench,
  X,
  Zap,
} from "lucide-vue-next";
import type { TargetProject } from "@shared/types.ts";
import { getProjectInfo, setTargetDir, stampFactory } from "@/lib/api";
import DiscoveryView from "@/views/DiscoveryView.vue";
import ConfigView from "@/views/ConfigView.vue";
import LaunchView from "@/views/LaunchView.vue";
import ObservabilityView from "@/views/ObservabilityView.vue";
import HistoryView from "@/views/HistoryView.vue";

const project = ref<TargetProject | null>(null);
const activeTab = ref<"discovery" | "config" | "launch" | "observability" | "history">("discovery");

// Inter-tab parameters
const launchPreselectedSpec = ref<string | null>(null);
const obsPreselectedAdwId = ref<string | null>(null);

// Project switch modal
const showSwitchModal = ref(false);
const newProjectPath = ref("");
const switching = ref(false);

// Stamping modal
const showStampModal = ref(false);
const stamping = ref(false);
const stampLog = ref("");

onMounted(async () => {
  await refreshProject();
});

async function refreshProject() {
  try {
    project.value = await getProjectInfo();
    if (project.value) {
      newProjectPath.value = project.value.path;
    }
  } catch (err) {
    console.error("Failed to load project info:", err);
  }
}

async function handleSwitchProject() {
  if (!newProjectPath.value.trim()) return;
  try {
    switching.value = true;
    project.value = await setTargetDir(newProjectPath.value.trim());
    showSwitchModal.value = false;
  } catch (err: any) {
    alert("Failed to switch project: " + err.message);
  } finally {
    switching.value = false;
  }
}

async function handleStampFactory() {
  try {
    stamping.value = true;
    stampLog.value = "Stamping Super Simple Software Factory into target repository...\n";
    const res = await stampFactory(false);
    stampLog.value += res.log;
    await refreshProject();
  } catch (err: any) {
    stampLog.value += `\nError: ${err.message}`;
  } finally {
    stamping.value = false;
  }
}

function onLaunchSpec(specPath: string) {
  launchPreselectedSpec.value = specPath;
  activeTab.value = "launch";
}

function onViewSession(adwId: string) {
  obsPreselectedAdwId.value = adwId;
  activeTab.value = "observability";
}
</script>

<template>
  <div class="studio-app">
    <!-- TOP NAVIGATION BAR -->
    <header class="studio-topbar">
      <!-- Brand & Project Indicator -->
      <div class="topbar-left">
        <div class="brand-group">
          <!-- Logo Mark -->
          <svg class="brand-logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="4" y="6" width="17" height="5" rx="2.5" fill="#e8b64a" />
            <rect x="8" y="13.5" width="20" height="5" rx="2.5" fill="#c89bff" />
            <rect x="4" y="21" width="13" height="5" rx="2.5" fill="#5ad2dd" />
          </svg>
          <div class="brand-text">
            <span class="brand-name">SSSF STUDIO</span>
            <span class="brand-tag">v1.0</span>
          </div>
        </div>

        <div class="project-pill" v-if="project" @click="showSwitchModal = true" title="Click to switch target repository">
          <FolderGit2 class="w-3.5 h-3.5 text-indigo-400" />
          <span class="font-bold text-xs text-zinc-200">{{ project.name }}</span>

          <span v-if="project.gitBranch" class="badge text-xs bg-zinc-900 border-zinc-800 text-zinc-400 font-mono">
            <GitBranch class="w-3 h-3 mr-0.5 inline" />
            {{ project.gitBranch }}
          </span>

          <span
            class="badge text-xs"
            :class="project.isStamped ? 'badge-green' : 'badge-amber'"
          >
            {{ project.isStamped ? "Stamped" : "Not Stamped" }}
          </span>
        </div>

        <!-- Stamping Quick Action if not stamped -->
        <button
          v-if="project && !project.isStamped"
          class="btn btn-primary text-xs py-1 px-2.5 animate-pulse"
          @click="showStampModal = true"
        >
          <Wrench class="w-3.5 h-3.5" />
          Stamp Factory Here
        </button>
      </div>

      <!-- Main Navigation Tabs -->
      <nav class="nav-tabs">
        <button
          class="nav-tab"
          :class="{ active: activeTab === 'discovery' }"
          @click="activeTab = 'discovery'"
        >
          <Compass class="w-4 h-4 text-indigo-400" />
          <span>Discovery</span>
        </button>

        <button
          class="nav-tab"
          :class="{ active: activeTab === 'config' }"
          @click="activeTab = 'config'"
        >
          <Sliders class="w-4 h-4 text-purple-400" />
          <span>Agent Roster</span>
        </button>

        <button
          class="nav-tab"
          :class="{ active: activeTab === 'launch' }"
          @click="activeTab = 'launch'"
        >
          <Zap class="w-4 h-4 text-emerald-400" />
          <span>Launch</span>
        </button>

        <button
          class="nav-tab"
          :class="{ active: activeTab === 'observability' }"
          @click="activeTab = 'observability'"
        >
          <Radio class="w-4 h-4 text-cyan-400" />
          <span>Observability</span>
        </button>

        <button
          class="nav-tab"
          :class="{ active: activeTab === 'history' }"
          @click="activeTab = 'history'"
        >
          <History class="w-4 h-4 text-amber-400" />
          <span>History</span>
        </button>
      </nav>
    </header>

    <!-- MAIN VIEW AREA -->
    <main class="studio-main">
      <DiscoveryView
        v-if="activeTab === 'discovery'"
        @launch-spec="onLaunchSpec"
      />

      <ConfigView
        v-else-if="activeTab === 'config'"
      />

      <LaunchView
        v-else-if="activeTab === 'launch'"
        :preselected-spec="launchPreselectedSpec"
        @view-session="onViewSession"
      />

      <ObservabilityView
        v-else-if="activeTab === 'observability'"
        :initial-adw-id="obsPreselectedAdwId"
      />

      <HistoryView
        v-else-if="activeTab === 'history'"
        @launch-spec="onLaunchSpec"
        @view-session="onViewSession"
      />
    </main>

    <!-- SWITCH PROJECT MODAL -->
    <div class="modal-overlay" v-if="showSwitchModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <FolderOpen class="w-5 h-5 text-indigo-400" />
            Switch Target Project Directory
          </h3>
          <button class="text-zinc-400 hover:text-white" @click="showSwitchModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-6 space-y-4">
          <p class="text-xs text-zinc-300">
            Specify the directory path of the repository you want SSSF Studio to operate on.
          </p>
          <div class="space-y-1">
            <label class="text-xs font-bold text-zinc-300">Absolute Project Path</label>
            <input
              v-model="newProjectPath"
              class="text-input text-xs font-mono"
              placeholder="e.g. C:\Projects\my-app"
              @keyup.enter="handleSwitchProject"
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button class="btn btn-secondary text-xs" @click="showSwitchModal = false">
              Cancel
            </button>
            <button
              class="btn btn-primary text-xs"
              :disabled="switching || !newProjectPath.trim()"
              @click="handleSwitchProject"
            >
              {{ switching ? "Switching..." : "Open Directory" }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- STAMP FACTORY MODAL -->
    <div class="modal-overlay" v-if="showStampModal">
      <div class="modal-card max-w-xl">
        <div class="modal-header">
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <Wrench class="w-5 h-5 text-amber-400" />
            Stamp Super Simple Software Factory
          </h3>
          <button class="text-zinc-400 hover:text-white" @click="showStampModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-6 space-y-4">
          <p class="text-xs text-zinc-300">
            This target repository does not currently contain the stamped factory. Clicking stamp executes the official installer:
            <code class="text-indigo-400 block mt-1 bg-zinc-950 p-1.5 rounded">uv run .claude/skills/sssf/scripts/install.py</code>
          </p>

          <div v-if="stampLog" class="bg-zinc-950 border border-zinc-800 p-3 rounded font-mono text-xs max-h-60 overflow-y-auto whitespace-pre-wrap">
            {{ stampLog }}
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button class="btn btn-secondary text-xs" @click="showStampModal = false">
              Close
            </button>
            <button
              class="btn btn-primary text-xs"
              :disabled="stamping"
              @click="handleStampFactory"
            >
              {{ stamping ? "Stamping..." : "Execute Install Stamp" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.studio-app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.studio-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 24px;
  background: rgba(11, 15, 24, 0.88);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 100;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-logo {
  width: 26px;
  height: 26px;
  filter: drop-shadow(0 0 8px rgba(99, 102, 241, 0.4));
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.brand-name {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.08em;
  background: linear-gradient(90deg, #c89bff, #5ad2dd);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.brand-tag {
  font-size: 10px;
  font-family: var(--mono);
  color: var(--faint);
}

.project-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--panel-3);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.project-pill:hover {
  border-color: var(--indigo);
  background: var(--panel-2);
}

.nav-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--panel-3);
  border: 1px solid var(--border-soft);
  padding: 3px;
  border-radius: 8px;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  background: transparent;
  color: var(--dim);
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 700;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.nav-tab:hover {
  color: var(--text);
  background: var(--panel-2);
}
.nav-tab.active {
  color: #fff;
  background: var(--indigo);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.35);
}

.studio-main {
  flex: 1;
  padding: 16px 24px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 90%;
  max-width: 480px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--panel-2);
}

.text-input {
  width: 100%;
  background: var(--panel-3);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  padding: 6px 10px;
  outline: none;
}
.text-input:focus {
  border-color: var(--indigo);
}
</style>
