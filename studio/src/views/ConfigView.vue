<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FileCode,
  Key,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Sliders,
  Trash2,
  Wrench,
  X,
} from "lucide-vue-next";
import type {
  AgentConfig,
  EnvKeyStatus,
  NamedRosterPreset,
  SssfConfig,
} from "@shared/types.ts";
import {
  applyRosterPreset,
  getEnvStatus,
  getRosterConfig,
  getRosterPresets,
  saveNamedRoster,
  saveRosterConfig,
  setEnvKey,
} from "@/lib/api";

const config = ref<SssfConfig | null>(null);
const rawYaml = ref("");
const presets = ref<NamedRosterPreset[]>([]);
const selectedPreset = ref("");
const envKeys = ref<EnvKeyStatus[]>([]);
const activeTab = ref<"visual" | "yaml" | "env">("visual");
const loading = ref(false);
const saving = ref(false);
const saveSuccess = ref(false);

// Preset modal
const showSavePresetModal = ref(false);
const newPresetName = ref("");

// Key editing
const editingKey = ref<string | null>(null);
const keyNewValue = ref("");
const showKeySecret = ref<Record<string, boolean>>({});

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const AVAILABLE_TOOLS = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
  "subagent_create",
  "subagent_continue",
  "subagent_list",
  "subagent_remove",
];

const POPULAR_MODELS = [
  "google/gemini-3.6-flash",
  "openrouter/google/gemini-2.5-flash",
  "openrouter/anthropic/claude-3.7-sonnet",
  "openrouter/anthropic/claude-3.5-haiku",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "fireworks/accounts/fireworks/models/kimi-k3",
  "openrouter/deepseek/deepseek-chat",
];

onMounted(async () => {
  await loadAll();
});

async function loadAll() {
  try {
    loading.value = true;
    const [cfgRes, presetsRes, envRes] = await Promise.all([
      getRosterConfig(),
      getRosterPresets(),
      getEnvStatus(),
    ]);
    config.value = cfgRes.config;
    rawYaml.value = cfgRes.rawYaml;
    presets.value = presetsRes;
    envKeys.value = envRes;
    if (presetsRes.length > 0) {
      selectedPreset.value = presetsRes[0].name;
    }
  } catch (err: any) {
    console.error("Failed to load config:", err);
  } finally {
    loading.value = false;
  }
}

async function handleSaveConfig() {
  if (!config.value) return;
  try {
    saving.value = true;
    const res = await saveRosterConfig(config.value);
    rawYaml.value = res.rawYaml;
    saveSuccess.value = true;
    setTimeout(() => {
      saveSuccess.value = false;
    }, 2500);
  } catch (err: any) {
    alert("Save failed: " + err.message);
  } finally {
    saving.value = false;
  }
}

async function handleApplyPreset() {
  if (!selectedPreset.value) return;
  try {
    loading.value = true;
    const res = await applyRosterPreset(selectedPreset.value);
    config.value = res.config;
    const updated = await getRosterConfig();
    rawYaml.value = updated.rawYaml;
    saveSuccess.value = true;
    setTimeout(() => {
      saveSuccess.value = false;
    }, 2000);
  } catch (err: any) {
    alert("Failed to apply preset: " + err.message);
  } finally {
    loading.value = false;
  }
}

async function handleSavePreset() {
  if (!newPresetName.value.trim() || !config.value) return;
  try {
    await saveNamedRoster(newPresetName.value.trim(), config.value);
    showSavePresetModal.value = false;
    newPresetName.value = "";
    presets.value = await getRosterPresets();
    alert("Saved custom preset successfully!");
  } catch (err: any) {
    alert("Failed to save preset: " + err.message);
  }
}

function addAgent() {
  if (!config.value) return;
  const name = "agent_" + (config.value.agents.length + 1);
  config.value.agents.push({
    name,
    purpose: "Specialized task execution",
    color: "#60a5fa",
    prompt_engineering: {
      system: `adws/adw_data/prompt_engineering/${name}/system.md`,
      user: `adws/adw_data/prompt_engineering/${name}/user.md`,
    },
    tools: ["read", "grep", "find", "ls", "bash", "write"],
    writes: [],
  });
}

function removeAgent(idx: number) {
  if (!config.value) return;
  if (confirm(`Remove agent "${config.value.agents[idx].name}"?`)) {
    config.value.agents.splice(idx, 1);
  }
}

function toggleAgentTool(agent: AgentConfig, tool: string) {
  if (!agent.tools) {
    agent.tools = [...(config.value?.defaults?.tools || ["read"])];
  }
  const idx = agent.tools.indexOf(tool);
  if (idx !== -1) {
    agent.tools.splice(idx, 1);
  } else {
    agent.tools.push(tool);
  }
}

async function handleSaveKey(keyName: string) {
  if (!keyNewValue.value.trim()) return;
  try {
    await setEnvKey(keyName, keyNewValue.value.trim());
    editingKey.value = null;
    keyNewValue.value = "";
    envKeys.value = await getEnvStatus();
  } catch (err: any) {
    alert("Failed to update key: " + err.message);
  }
}
</script>

<template>
  <div class="config-container">
    <!-- Header Controls -->
    <div class="config-header">
      <div class="header-left">
        <div class="title-row">
          <Sliders class="w-5 h-5 text-indigo-400" />
          <h2 class="text-xl font-bold tracking-wide">Agent Roster Configuration</h2>
          <span class="badge badge-purple font-mono text-xs">Active roster</span>
        </div>
        <p class="text-xs text-zinc-400">
          Visual tuning for models, thinking levels, tool allowlists, and write boundaries per agent.
        </p>
      </div>

      <div class="header-right">
        <!-- Preset picker -->
        <div class="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded p-1">
          <Bookmark class="w-4 h-4 text-zinc-400 ml-1.5" />
          <select v-model="selectedPreset" class="preset-select text-xs">
            <option v-for="p in presets" :key="p.name" :value="p.name">
              {{ p.name }} ({{ p.tag }})
            </option>
          </select>
          <button class="btn btn-secondary text-xs py-1" @click="handleApplyPreset">
            Apply Preset
          </button>
        </div>

        <button class="btn btn-secondary text-xs" @click="showSavePresetModal = true">
          Save as Preset
        </button>

        <button
          class="btn btn-primary text-xs"
          :disabled="saving"
          @click="handleSaveConfig"
        >
          <Check class="w-4 h-4 text-emerald-300" v-if="saveSuccess" />
          <Save class="w-4 h-4" v-else />
          {{ saveSuccess ? "Saved!" : saving ? "Saving..." : "Save Config" }}
        </button>
      </div>
    </div>

    <!-- Navigation Tab Strip -->
    <div class="tab-strip">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'visual' }"
        @click="activeTab = 'visual'"
      >
        <Layers class="w-4 h-4 text-indigo-400" />
        Visual Roster Editor
        <span class="pill-count" v-if="config">{{ config.agents.length }}</span>
      </button>

      <button
        class="tab-btn"
        :class="{ active: activeTab === 'yaml' }"
        @click="activeTab = 'yaml'"
      >
        <FileCode class="w-4 h-4 text-cyan-400" />
        Raw YAML View
      </button>

      <button
        class="tab-btn"
        :class="{ active: activeTab === 'env' }"
        @click="activeTab = 'env'"
      >
        <Key class="w-4 h-4 text-amber-400" />
        API Keys & .env
        <span class="pill-count text-emerald-400" v-if="envKeys">
          {{ envKeys.filter((k) => k.isSet).length }}/{{ envKeys.length }}
        </span>
      </button>
    </div>

    <!-- TAB 1: VISUAL ROSTER EDITOR -->
    <div class="config-body" v-if="activeTab === 'visual' && config">
      <!-- Defaults Panel -->
      <div class="section-card">
        <div class="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
          <div class="flex items-center gap-2">
            <Wrench class="w-4 h-4 text-zinc-400" />
            <span class="font-bold text-sm text-zinc-200 uppercase tracking-wide">
              Global Roster Defaults
            </span>
          </div>
          <span class="text-xs text-zinc-500">
            Agents inherit these settings unless overridden.
          </span>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div class="space-y-1">
            <label class="text-xs font-bold text-zinc-400">Default Model (provider/id)</label>
            <input
              v-model="config.defaults.model"
              class="text-input text-xs font-mono"
              placeholder="google/gemini-3.6-flash"
            />
          </div>

          <div class="space-y-1">
            <label class="text-xs font-bold text-zinc-400">Default Thinking</label>
            <select v-model="config.defaults.thinking" class="text-input text-xs">
              <option v-for="t in THINKING_LEVELS" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>

          <div class="space-y-1">
            <label class="text-xs font-bold text-zinc-400">Coding Agent Harness</label>
            <input
              v-model="config.defaults.coding_agent"
              class="text-input text-xs font-mono"
              disabled
            />
          </div>
        </div>

        <!-- Protected Files -->
        <div class="mt-4 pt-3 border-t border-zinc-850">
          <label class="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
            <Lock class="w-3.5 h-3.5 text-amber-400" />
            Protected Files (Off-limits to repo edits)
          </label>
          <div class="flex flex-wrap gap-2 mt-1.5">
            <span
              v-for="p in config.defaults.protected_files"
              :key="p"
              class="badge text-xs font-mono text-zinc-300 border-zinc-700"
            >
              🔒 {{ p }}
            </span>
          </div>
        </div>
      </div>

      <!-- Agents Grid -->
      <div class="agents-section">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h3 class="font-bold text-base text-zinc-200">Configured Agents</h3>
            <span class="badge badge-purple">{{ config.agents.length }} agents</span>
          </div>

          <button class="btn btn-secondary text-xs" @click="addAgent">
            <Plus class="w-3.5 h-3.5" />
            Add Custom Agent
          </button>
        </div>

        <div class="agents-grid">
          <div
            v-for="(agent, idx) in config.agents"
            :key="agent.name"
            class="agent-card"
            :style="{ borderColor: agent.color || '#3b82f6' }"
          >
            <!-- Agent Header -->
            <div class="agent-card-header">
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  v-model="agent.color"
                  class="color-picker"
                  title="Lane Color"
                />
                <input
                  v-model="agent.name"
                  class="agent-name-input"
                  placeholder="agent_name"
                />
              </div>

              <button
                class="text-zinc-500 hover:text-red-400 p-1"
                @click="removeAgent(idx)"
                title="Delete Agent"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>

            <!-- Purpose -->
            <div class="space-y-1">
              <label class="text-xs text-zinc-400 font-bold">Purpose</label>
              <textarea
                v-model="agent.purpose"
                class="agent-purpose-textarea"
                rows="2"
                placeholder="Agent role and responsibility"
              ></textarea>
            </div>

            <!-- Model Override -->
            <div class="space-y-1">
              <label class="text-xs text-zinc-400 font-bold flex items-center justify-between">
                <span>Legacy model reference</span>
                <span class="text-zinc-500 font-normal">
                  {{ agent.model ? "Custom" : "(Inherits default)" }}
                </span>
              </label>
              <input
                v-model="agent.model"
                disabled
                class="text-input text-xs font-mono"
                :placeholder="config.defaults.model"
              />
              <p class="dim">Choose the actual model in Connection profiles. Saving a custom roster also saves those connections privately.</p>
            </div>

            <!-- Thinking Override -->
            <div class="space-y-1">
              <label class="text-xs text-zinc-400 font-bold">Thinking Level</label>
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="lvl in THINKING_LEVELS"
                  :key="lvl"
                  class="think-btn"
                  :class="{ active: (agent.thinking || config.defaults.thinking) === lvl }"
                  @click="agent.thinking = lvl"
                >
                  {{ lvl }}
                </button>
              </div>
            </div>

            <!-- Write Boundaries -->
            <div class="space-y-1">
              <label class="text-xs text-zinc-400 font-bold flex items-center justify-between">
                <span>Write Boundary</span>
                <span class="badge text-xs" :class="agent.writes?.length ? 'badge-blue' : 'badge-amber'">
                  {{ agent.writes === undefined ? 'Unrestricted' : agent.writes.length ? 'Path-Scoped' : 'Read-Only' }}
                </span>
              </label>
              <div class="text-xs text-zinc-400">
                <span v-if="agent.writes === undefined">Mutates repository freely</span>
                <span v-else-if="agent.writes.length === 0">Read-only with respect to repo</span>
                <span v-else>Allowed writes: <code>{{ agent.writes.join(', ') }}</code></span>
              </div>
            </div>

            <!-- Tools Allowlist -->
            <div class="space-y-1.5">
              <label class="text-xs text-zinc-400 font-bold">Tools Allowlist</label>
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="tool in AVAILABLE_TOOLS"
                  :key="tool"
                  class="tool-chip"
                  :class="{ active: (agent.tools || config.defaults.tools).includes(tool) }"
                  @click="toggleAgentTool(agent, tool)"
                >
                  {{ tool }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: RAW YAML VIEW -->
    <div class="config-body" v-if="activeTab === 'yaml'">
      <div class="yaml-container">
        <textarea
          v-model="rawYaml"
          class="yaml-textarea"
          spellcheck="false"
        ></textarea>
      </div>
    </div>

    <!-- TAB 3: API KEYS & .ENV -->
    <div class="config-body" v-if="activeTab === 'env'">
      <div class="section-card max-w-4xl mx-auto">
        <div class="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800">
          <div>
            <h3 class="font-bold text-base text-zinc-200 flex items-center gap-2">
              <Key class="w-4 h-4 text-amber-400" />
              Target Project API Keys
            </h3>
            <p class="text-xs text-zinc-400 mt-0.5">
              Stored exclusively in the target repository's <code>.env</code> file (gitignored). Keys are never committed.
            </p>
          </div>
          <button class="btn btn-secondary text-xs" @click="loadAll">
            <RefreshCw class="w-3.5 h-3.5" />
            Reload Keys
          </button>
        </div>

        <div class="space-y-3">
          <div
            v-for="k in envKeys"
            :key="k.key"
            class="key-row"
            :class="{ 'key-active': k.isSet }"
          >
            <div class="key-left">
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm font-mono text-zinc-200">{{ k.key }}</span>
                <span
                  class="badge text-xs"
                  :class="k.isSet ? 'badge-green' : 'badge-red'"
                >
                  {{ k.isSet ? "Configured" : "Missing" }}
                </span>
              </div>
              <p class="text-xs text-zinc-400 mt-1">{{ k.description }}</p>
              <div class="flex items-center gap-1.5 mt-1">
                <span class="text-xs text-zinc-500">Required by:</span>
                <span
                  v-for="req in k.requiredBy"
                  :key="req"
                  class="badge text-xs text-zinc-400 border-zinc-800 font-mono"
                >
                  {{ req }}
                </span>
              </div>
            </div>

            <div class="key-right">
              <div v-if="editingKey === k.key" class="flex items-center gap-2">
                <input
                  v-model="keyNewValue"
                  class="text-input text-xs font-mono w-64"
                  placeholder="Paste sk-..."
                  type="password"
                />
                <button
                  class="btn btn-primary text-xs py-1 px-3"
                  @click="handleSaveKey(k.key)"
                >
                  Save
                </button>
                <button
                  class="btn btn-secondary text-xs py-1 px-2"
                  @click="editingKey = null"
                >
                  Cancel
                </button>
              </div>

              <div v-else class="flex items-center gap-2">
                <code class="text-xs font-mono text-zinc-400 bg-zinc-900 px-2 py-1 rounded">
                  {{ k.isSet ? k.maskedValue : "Not set" }}
                </code>
                <button
                  class="btn btn-secondary text-xs py-1 px-2.5"
                  @click="editingKey = k.key; keyNewValue = ''"
                >
                  {{ k.isSet ? "Change" : "Set Key" }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Preset Modal -->
    <div class="modal-overlay" v-if="showSavePresetModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="text-base font-bold text-white">Save Current Roster Preset</h3>
          <button class="text-zinc-400 hover:text-white" @click="showSavePresetModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-6 space-y-4">
          <p class="text-xs text-zinc-300">
            Saves this roster and a private snapshot of your current connections for easy recall.
          </p>
          <div class="space-y-1">
            <label class="text-xs font-bold text-zinc-300">Preset Name</label>
            <input
              v-model="newPresetName"
              class="text-input text-xs"
              placeholder="e.g. My Fast OpenRouter Roster"
              @keyup.enter="handleSavePreset"
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button class="btn btn-secondary text-xs" @click="showSavePresetModal = false">
              Cancel
            </button>
            <button
              class="btn btn-primary text-xs"
              :disabled="!newPresetName.trim()"
              @click="handleSavePreset"
            >
              Save Preset
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.config-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: calc(100vh - 120px);
}

.config-header {
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

.preset-select {
  background: transparent;
  border: none;
  color: var(--text);
  font-family: var(--sans);
  outline: none;
  padding: 2px 6px;
}

.tab-strip {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--panel-3);
  border-radius: 6px 6px 0 0;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--dim);
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.tab-btn.active {
  color: var(--text);
  border-bottom-color: var(--indigo);
  background: var(--panel);
}

.pill-count {
  background: var(--panel-2);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
}

.config-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.section-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px;
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

.agents-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 14px;
}

.agent-card {
  background: var(--panel);
  border: 1px solid;
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.agent-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.color-picker {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.agent-name-input {
  font-weight: 700;
  font-size: 14px;
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--border);
  color: var(--text);
  outline: none;
  padding: 2px 4px;
}

.agent-purpose-textarea {
  width: 100%;
  background: var(--panel-3);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  color: var(--dim);
  font-size: 12px;
  padding: 6px;
  resize: none;
  outline: none;
}

.think-btn {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--dim);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}
.think-btn.active {
  background: rgba(148, 163, 255, 0.2);
  border-color: var(--violet);
  color: var(--violet);
  font-weight: bold;
}

.tool-chip {
  background: var(--panel-3);
  border: 1px solid var(--border-soft);
  color: var(--faint);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}
.tool-chip.active {
  background: rgba(90, 210, 221, 0.15);
  border-color: var(--cyan);
  color: var(--cyan);
  font-weight: bold;
}

/* YAML view */
.yaml-container {
  height: 100%;
  display: flex;
}
.yaml-textarea {
  width: 100%;
  height: 100%;
  background: var(--panel-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: #cfdded;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.5;
  padding: 16px;
  outline: none;
  resize: none;
}

/* Key rows */
.key-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--panel-3);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
}
.key-row.key-active {
  border-color: rgba(74, 222, 128, 0.2);
}

.key-left {
  max-width: 65%;
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
  max-width: 440px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--panel-2);
}
</style>
