<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  Activity,
  ArrowRight,
  CheckCircle,
  Clock,
  Compass,
  ExternalLink,
  FileText,
  Play,
  RotateCcw,
  Square,
  Terminal,
  Zap,
} from "lucide-vue-next";
import type {
  AdwWorkflowInfo,
  ApprovedSpecSummary,
  LaunchRequest,
  LiveRunState,
  TargetProject,
} from "@shared/types.ts";
import {
  getActiveRuns,
  getProjectInfo,
  getRunState,
  getWorkflows,
  launchWorkflow,
  stopRun,
} from "@/lib/api";

const props = defineProps<{
  preselectedSpec?: string | null;
}>();

const emit = defineEmits<{
  (e: "view-session", adwId: string): void;
}>();

const project = ref<TargetProject | null>(null);
const workflows = ref<AdwWorkflowInfo[]>([]);
const selectedWorkflow = ref("adw_simple_sdlc.py");

// Prompt source
const promptMode = ref<"approved-spec" | "custom-text">("approved-spec");
const selectedSpec = ref("");
const customPrompt = ref("");

// Live run state
const currentRun = ref<LiveRunState | null>(null);
const activeRunsList = ref<LiveRunState[]>([]);
const launching = ref(false);
const autoScroll = ref(true);
const terminalContainer = ref<HTMLDivElement | null>(null);

let pollInterval: any = null;

onMounted(async () => {
  await loadData();

  if (props.preselectedSpec) {
    promptMode.value = "approved-spec";
    selectedSpec.value = props.preselectedSpec;
  }

  // Poll active run if running
  pollInterval = setInterval(async () => {
    if (currentRun.value && currentRun.value.status === "running") {
      try {
        const state = await getRunState(currentRun.value.runId);
        if (state) {
          currentRun.value = state;
          if (autoScroll.value && terminalContainer.value) {
            terminalContainer.value.scrollTop = terminalContainer.value.scrollHeight;
          }
        }
      } catch {}
    }
    // Also check active runs
    try {
      activeRunsList.value = await getActiveRuns();
    } catch {}
  }, 1000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});

async function loadData() {
  try {
    const [projRes, wfRes, runsRes] = await Promise.all([
      getProjectInfo(),
      getWorkflows(),
      getActiveRuns(),
    ]);
    project.value = projRes;
    workflows.value = wfRes;
    activeRunsList.value = runsRes;

    if (projRes.approvedSpecs.length > 0 && !selectedSpec.value) {
      selectedSpec.value = projRes.approvedSpecs[0].filePath;
    }

    if (runsRes.length > 0 && !currentRun.value) {
      currentRun.value = runsRes[0];
    }
  } catch (err) {
    console.error("Failed to load launch data:", err);
  }
}

async function handleLaunch() {
  if (launching.value) return;

  const req: LaunchRequest = {
    workflowId: selectedWorkflow.value,
    promptMode: promptMode.value,
    specPath: promptMode.value === "approved-spec" ? selectedSpec.value : undefined,
    customPrompt: promptMode.value === "custom-text" ? customPrompt.value : undefined,
  };

  try {
    launching.value = true;
    const runState = await launchWorkflow(req);
    currentRun.value = runState;
  } catch (err: any) {
    alert("Launch failed: " + err.message);
  } finally {
    launching.value = false;
  }
}

async function handleStop() {
  if (!currentRun.value) return;
  try {
    await stopRun(currentRun.value.runId);
    const updated = await getRunState(currentRun.value.runId);
    if (updated) currentRun.value = updated;
  } catch (err: any) {
    alert("Failed to stop process: " + err.message);
  }
}

function openInTrace() {
  if (currentRun.value?.adwId) {
    emit("view-session", currentRun.value.adwId);
  }
}

const chosenWf = computed(() => {
  return workflows.value.find((w) => w.id === selectedWorkflow.value);
});
</script>

<template>
  <div class="launch-container">
    <!-- Header -->
    <div class="launch-header">
      <div class="header-left">
        <div class="title-row">
          <Zap class="w-5 h-5 text-indigo-400" />
          <h2 class="text-xl font-bold tracking-wide">Launch Factory Workflows</h2>
          <span class="badge badge-green" v-if="currentRun?.status === 'running'">
            ● 1 Workflow Running
          </span>
        </div>
        <p class="text-xs text-zinc-400">
          Execute Super Simple Software Factory ADWs against the target repository with approved specifications.
        </p>
      </div>

      <div class="header-right">
        <button
          v-if="currentRun?.status === 'running'"
          class="btn btn-danger text-xs"
          @click="handleStop"
        >
          <Square class="w-3.5 h-3.5" />
          Stop Run (PID: {{ currentRun.pid }})
        </button>

        <button
          class="btn btn-primary text-xs"
          :disabled="launching || currentRun?.status === 'running'"
          @click="handleLaunch"
        >
          <Play class="w-4 h-4" />
          {{ launching ? "Spawning..." : "Launch Workflow" }}
        </button>
      </div>
    </div>

    <!-- Main 2-column layout -->
    <div class="launch-grid">
      <!-- LEFT: Workflow & Prompt Selector -->
      <div class="config-side">
        <!-- 1. Workflow Cards -->
        <div class="section-card">
          <label class="section-label">Select Factory Workflow (ADW)</label>
          <div class="workflow-list">
            <div
              v-for="wf in workflows"
              :key="wf.id"
              class="wf-card"
              :class="{ selected: selectedWorkflow === wf.id }"
              @click="selectedWorkflow = wf.id"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-sm text-zinc-200">{{ wf.name }}</span>
                  <span class="badge badge-blue text-xs font-mono">{{ wf.scriptFile }}</span>
                </div>
                <span class="badge badge-green text-xs" v-if="wf.badge">{{ wf.badge }}</span>
              </div>

              <p class="text-xs text-zinc-400 mt-1 leading-relaxed">{{ wf.description }}</p>

              <!-- Phase pipeline -->
              <div class="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
                <span class="text-xs text-zinc-500 font-mono">Chain:</span>
                <span
                  v-for="(ph, i) in wf.phases"
                  :key="ph"
                  class="badge text-xs bg-zinc-900 border-zinc-800 text-zinc-300 font-mono"
                >
                  {{ ph }}
                  <span v-if="i < wf.phases.length - 1" class="text-zinc-600 ml-1">→</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. Prompt Source Selector -->
        <div class="section-card">
          <label class="section-label">Prompt Input</label>

          <div class="flex items-center gap-4 mb-3">
            <label class="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
              <input
                type="radio"
                value="approved-spec"
                v-model="promptMode"
                class="accent-indigo-500"
              />
              Approved Specification
            </label>
            <label class="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
              <input
                type="radio"
                value="custom-text"
                v-model="promptMode"
                class="accent-indigo-500"
              />
              Ad-Hoc Custom Prompt
            </label>
          </div>

          <!-- Approved Specs dropdown -->
          <div v-if="promptMode === 'approved-spec'" class="space-y-2">
            <div v-if="project?.approvedSpecs.length">
              <select v-model="selectedSpec" class="spec-select">
                <option
                  v-for="spec in project.approvedSpecs"
                  :key="spec.filePath"
                  :value="spec.filePath"
                >
                  📄 {{ spec.fileName }} — "{{ spec.title }}"
                </option>
              </select>
              <p class="text-xs text-zinc-500 mt-1">
                Passing path directly to ADW: <code>{{ selectedSpec }}</code>
              </p>
            </div>
            <div v-else class="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/40 p-3 rounded">
              No approved specifications found in <code>requests/</code> yet. Create and approve one in the <strong>Discovery</strong> tab first!
            </div>
          </div>

          <!-- Custom prompt textarea -->
          <div v-else>
            <textarea
              v-model="customPrompt"
              class="custom-textarea"
              rows="3"
              placeholder="e.g. Add health check endpoint with JSON response"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- RIGHT: Real-time Terminal & Execution Status -->
      <div class="terminal-side">
        <!-- Terminal Header -->
        <div class="terminal-header">
          <div class="flex items-center gap-2">
            <Terminal class="w-4 h-4 text-cyan-400" />
            <span class="font-bold text-xs uppercase tracking-wider text-zinc-300">
              Live Factory Console Output
            </span>
            <span
              v-if="currentRun"
              class="badge text-xs"
              :class="currentRun.status === 'running' ? 'badge-amber' : currentRun.status === 'success' ? 'badge-green' : 'badge-red'"
            >
              {{ currentRun.status }}
            </span>
          </div>

          <div class="flex items-center gap-3 text-xs">
            <span v-if="currentRun?.adwId" class="font-mono text-indigo-400">
              adw_id: <strong>{{ currentRun.adwId }}</strong>
            </span>
            <button
              v-if="currentRun?.adwId"
              class="btn btn-secondary text-xs py-0.5 px-2"
              @click="openInTrace"
              title="Open Session in Observability"
            >
              <ExternalLink class="w-3 h-3" />
              Trace UI
            </button>
            <label class="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
              <input type="checkbox" v-model="autoScroll" class="accent-indigo-500" />
              Auto-scroll
            </label>
          </div>
        </div>

        <!-- Terminal Output View -->
        <div ref="terminalContainer" class="terminal-body">
          <div v-if="currentRun && currentRun.logs.length" class="log-lines">
            <div
              v-for="(line, idx) in currentRun.logs"
              :key="idx"
              class="log-line"
              :class="{
                'text-indigo-400 font-bold': line.startsWith('[studio]'),
                'text-emerald-400': line.includes('✓') || line.includes('success'),
                'text-red-400': line.includes('✗') || line.includes('fail') || line.includes('error'),
                'text-amber-300': line.includes('▶') || line.includes('Running'),
              }"
            >
              {{ line }}
            </div>
          </div>
          <div v-else class="empty-terminal">
            <Terminal class="w-10 h-10 text-zinc-700 mx-auto mb-2" />
            <p class="text-zinc-500 text-xs">No active execution. Select a workflow and click Launch above.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.launch-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: calc(100vh - 120px);
}

.launch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.launch-grid {
  display: grid;
  grid-template-columns: 460px 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.config-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.section-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.section-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--dim);
  margin-bottom: 10px;
}

.workflow-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wf-card {
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.wf-card:hover {
  border-color: var(--border);
  background: var(--panel-2);
}
.wf-card.selected {
  border-color: var(--indigo);
  background: rgba(99, 102, 241, 0.08);
}

.spec-select {
  width: 100%;
  background: var(--panel-3);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
.spec-select:focus {
  border-color: var(--indigo);
}

.custom-textarea {
  width: 100%;
  background: var(--panel-3);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  resize: none;
}
.custom-textarea:focus {
  border-color: var(--indigo);
}

.terminal-side {
  background: var(--panel-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.terminal-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.55;
  background: #04060a;
}

.log-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.log-line {
  color: #cad5e2;
  white-space: pre-wrap;
  word-break: break-all;
}

.empty-terminal {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
