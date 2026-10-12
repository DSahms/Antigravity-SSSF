<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  AlertCircle, CheckCircle2, Clipboard, Eye, EyeOff, Key, Plug,
  RefreshCw, Save,
} from "lucide-vue-next";
import ScreenHeader from "@/components/ScreenHeader.vue";
import {
  fetchModels, getProfiles, saveProfile, setDefaultTokenCap, testConnection,
} from "@/lib/api";
import type {
  ConnectionProfile, ConnectionProfileStore, FetchModelsResponse,
  TestConnectionResponse,
} from "@shared/types.ts";
import ConfigView from "@/views/ConfigView.vue";

const store = ref<ConnectionProfileStore | null>(null);
const tab = ref<"profiles" | "token" | "roster">("profiles");
const activeRole = ref<string>("");
const activeProvider = ref<"local" | "cloud">("local");

const fetchModelsResult = ref<Record<string, FetchModelsResponse>>({});
const testResult = ref<Record<string, TestConnectionResponse>>({});
const busy = ref<Record<string, "fetch" | "test" | "save" | null>>({});
const showSecret = ref<Record<string, boolean>>({});
const keyBuffer = ref<Record<string, string>>({});
const modelsDropdown = ref<Record<string, string[]>>({});
const saveOk = ref<Record<string, boolean>>({});

onMounted(async () => {
  try {
    store.value = await getProfiles();
    if (store.value.profiles.length) {
      const first = store.value.profiles[0];
      activeRole.value = first.role;
      activeProvider.value = first.provider;
    }
  } catch (e) {
    console.error("Settings load failed:", e);
  }
});

const activeProfile = computed<ConnectionProfile | null>(() => {
  if (!store.value) return null;
  return store.value.profiles.find(
    p => p.role === activeRole.value && p.provider === activeProvider.value,
  ) ?? null;
});

const roles = computed(() => {
  if (!store.value) return [];
  const seen = new Set<string>();
  const out: { role: string; label: string; providers: ("local" | "cloud")[] }[] = [];
  for (const p of store.value.profiles) {
    if (!seen.has(p.role)) {
      seen.add(p.role);
      const providers = store.value.profiles
        .filter(x => x.role === p.role)
        .map(x => x.provider);
      out.push({ role: p.role, label: p.label.replace(/ \(cloud\)$/, ""), providers });
    }
  }
  return out;
});

function key(p: ConnectionProfile): string {
  return `${p.role}:${p.provider}`;
}

function maskedValue(p: ConnectionProfile): string {
  if (!p.apiKey || p.apiKey === "none") return "";
  if (showSecret.value[key(p)]) return p.apiKey;
  if (p.apiKey.length > 10) return p.apiKey.slice(0, 4) + "••••••••" + p.apiKey.slice(-4);
  return "••••••••";
}

function isBusy(p: ConnectionProfile | null, action: "fetch" | "test" | "save"): boolean {
  if (!p) return false;
  return busy.value[key(p)] === action;
}

function spinClass(p: ConnectionProfile | null): string {
  return isBusy(p, "fetch") ? "spin" : "";
}

async function pasteKey(p: ConnectionProfile) {
  try {
    const text = (await navigator.clipboard.readText()).replace(/\s+/g, "").trim();
    if (!text) return;
    keyBuffer.value[key(p)] = text;
    showSecret.value[key(p)] = true;
  } catch {
    alert("Couldn't read the clipboard. That didn't work. Here's what to try: copy the key first, then click Paste.");
  }
}

async function handleFetchModels(p: ConnectionProfile) {
  busy.value[key(p)] = "fetch";
  try {
    const res = await fetchModels(p.baseUrl, keyBuffer.value[key(p)] || p.apiKey);
    fetchModelsResult.value[key(p)] = res;
    if (res.models?.length) {
      modelsDropdown.value[key(p)] = res.models;
    }
  } finally {
    busy.value[key(p)] = null;
  }
}

async function handleTestConnection(p: ConnectionProfile) {
  busy.value[key(p)] = "test";
  try {
    const res = await testConnection(
      p.baseUrl,
      p.model,
      keyBuffer.value[key(p)] || p.apiKey,
    );
    testResult.value[key(p)] = res;
  } finally {
    busy.value[key(p)] = null;
  }
}

async function handleSave(p: ConnectionProfile) {
  busy.value[key(p)] = "save";
  try {
    const incoming = keyBuffer.value[key(p)];
    const updated: ConnectionProfile = {
      ...p,
      apiKey: incoming && incoming !== "••••••••" ? incoming : p.apiKey,
    };
    store.value = await saveProfile(updated);
    keyBuffer.value[key(p)] = "";
    showSecret.value[key(p)] = false;
    saveOk.value[key(p)] = true;
    setTimeout(() => { saveOk.value[key(p)] = false; }, 2000);
  } finally {
    busy.value[key(p)] = null;
  }
}

async function handleSaveCap() {
  if (!store.value) return;
  try {
    store.value = await setDefaultTokenCap(store.value.defaultTokenCap);
  } catch (e: any) { alert(e.message); }
}

const REASONING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
</script>

<template>
  <div>
    <ScreenHeader screen="settings" hide-step />

    <div class="settings-tabs">
      <button class="tab-btn" :class="{ active: tab === 'profiles' }" @click="tab = 'profiles'">Connection profiles</button>
      <button class="tab-btn" :class="{ active: tab === 'token' }" @click="tab = 'token'">Token guard</button>
      <button class="tab-btn" :class="{ active: tab === 'roster' }" @click="tab = 'roster'">Roster &amp; API keys</button>
    </div>

    <!-- PROFILES TAB -->
    <div v-if="tab === 'profiles' && store">
      <div class="profile-cols">
        <div class="section-card role-list">
          <div class="section-label">Roles</div>
          <button
            v-for="r in roles"
            :key="r.role"
            class="role-row"
            :class="{ active: activeRole === r.role }"
            @click="activeRole = r.role"
          >
            <Key :size="14" />
            <span>{{ r.label }}</span>
            <span class="badge" v-if="r.providers.includes('local')">local</span>
            <span
              class="badge"
              v-if="r.providers.includes('cloud')"
              :class="store.profiles.find(p => p.role === r.role && p.provider === 'cloud')?.disabled ? 'badge-red' : ''"
            >cloud</span>
          </button>
        </div>

        <div class="section-card profile-detail">
          <div v-if="activeProfile">
            <div class="provider-tabs">
              <button class="tab-btn" :class="{ active: activeProvider === 'local' }" @click="activeProvider = 'local'">Local (KoboldCpp)</button>
              <button
                class="tab-btn"
                :class="{ active: activeProvider === 'cloud' }"
                :disabled="!roles.find(r => r.role === activeRole)?.providers.includes('cloud')"
                @click="activeProvider = 'cloud'"
              >Cloud (Venice)</button>
            </div>

            <div v-if="activeProfile.provider === 'cloud' && activeProfile.disabled" class="callout warn" style="margin-bottom: 10px;">
              Cloud is disabled until a <code>VENICE_API_KEY</code> is set in <code>.env</code>.
            </div>

            <div class="field">
              <label class="field-label">Base URL</label>
              <input type="text" v-model="activeProfile.baseUrl" placeholder="http://127.0.0.1:5001/v1" />
            </div>

            <div class="field">
              <label class="field-label">Model</label>
              <div class="field-row">
                <input type="text" v-model="activeProfile.model" list="models-list" />
                <button class="btn btn-secondary btn-sm" :disabled="isBusy(activeProfile, 'fetch')" @click="handleFetchModels(activeProfile)">
                  <RefreshCw :size="13" :class="spinClass(activeProfile)" /> Fetch models
                </button>
              </div>
              <datalist id="models-list">
                <option v-for="m in modelsDropdown[key(activeProfile)] ?? []" :key="m" :value="m" />
              </datalist>
              <div v-if="fetchModelsResult[key(activeProfile)]?.error" class="dim" style="color: var(--red); font-size: 12px; margin-top: 4px;">
                {{ fetchModelsResult[key(activeProfile)]!.error }}
              </div>
              <div v-else-if="fetchModelsResult[key(activeProfile)]?.models?.length" class="dim" style="font-size: 12px; margin-top: 4px;">
                Found {{ fetchModelsResult[key(activeProfile)]!.models.length }} models. Pick from the dropdown.
              </div>
            </div>

            <div class="field">
              <label class="field-label">API key</label>
              <div class="field-row">
                <input
                  :type="showSecret[key(activeProfile)] ? 'text' : 'password'"
                  :value="keyBuffer[key(activeProfile)] ?? maskedValue(activeProfile)"
                  @input="keyBuffer[key(activeProfile)] = ($event.target as HTMLInputElement).value"
                  :placeholder="activeProfile.provider === 'local' ? 'none (local)' : 'paste your key'"
                />
                <button class="btn btn-ghost btn-xs" @click="pasteKey(activeProfile)" title="Paste and trim">
                  <Clipboard :size="13" /> Paste
                </button>
                <button class="btn btn-ghost btn-xs" @click="showSecret[key(activeProfile)] = !showSecret[key(activeProfile)]" :title="showSecret[key(activeProfile)] ? 'Hide' : 'Show'">
                  <Eye v-if="!showSecret[key(activeProfile)]" :size="13" />
                  <EyeOff v-else :size="13" />
                </button>
              </div>
              <div class="dim" style="font-size: 11.5px; margin-top: 4px;">
                Keys are masked, never logged, and stored only in <code>.sssf/profiles.json</code> (gitignored).
              </div>
            </div>

            <div class="field-grid">
              <div class="field">
                <label class="field-label">Reasoning level</label>
                <select v-model="activeProfile.reasoningLevel">
                  <option v-for="lvl in REASONING_LEVELS" :key="lvl" :value="lvl">{{ lvl }}</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label">Hide "thinking" text</label>
                <label class="check-row">
                  <input type="checkbox" v-model="activeProfile.hideThinking" />
                  <span class="dim" style="font-size: 12.5px;">Hide chain-of-thought text in console output.</span>
                </label>
              </div>
            </div>

            <div class="action-row">
              <button class="btn btn-secondary" :disabled="isBusy(activeProfile, 'test')" @click="handleTestConnection(activeProfile)">
                <Plug :size="14" /> Test connection
              </button>
              <button class="btn btn-primary" :disabled="isBusy(activeProfile, 'save')" @click="handleSave(activeProfile)">
                <Save :size="14" /> Save profile
              </button>
              <CheckCircle2 v-if="saveOk[key(activeProfile)]" :size="16" style="color: var(--green);" />
            </div>

            <div v-if="testResult[key(activeProfile)]" class="test-result" :class="{ ok: testResult[key(activeProfile)]!.ok, err: !testResult[key(activeProfile)]!.ok }">
              <component :is="testResult[key(activeProfile)]!.ok ? CheckCircle2 : AlertCircle" :size="14" />
              <div>
                <div style="font-weight: 600;">{{ testResult[key(activeProfile)]!.ok ? "Connected" : "Couldn't connect" }}</div>
                <div class="dim" style="font-size: 12.5px;">{{ testResult[key(activeProfile)]!.message }}</div>
                <div v-if="testResult[key(activeProfile)]!.detail" class="dim mono" style="font-size: 11px;">{{ testResult[key(activeProfile)]!.detail }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TOKEN GUARD TAB -->
    <div v-if="tab === 'token' && store">
      <div class="section-card" style="max-width: 500px;">
        <div class="section-label">Default token cap</div>
        <p class="dim" style="font-size: 13px; margin: 0 0 10px;">
          Every new run starts with this cap. When usage reaches the cap, the run stops with a calm plain-language message. Default low so a runaway job can't drain your wallet.
        </p>
        <div class="field-row">
          <input type="number" v-model.number="store.defaultTokenCap" min="0" step="1000" />
          <button class="btn btn-primary" @click="handleSaveCap"><Save :size="14" /> Save</button>
        </div>
        <div class="dim" style="font-size: 12px; margin-top: 6px;">
          Current: {{ store.defaultTokenCap.toLocaleString() }} tokens. Set 0 to disable the cap (not recommended).
        </div>
      </div>
    </div>

    <!-- ROSTER TAB (existing ConfigView) -->
    <div v-if="tab === 'roster'">
      <ConfigView />
    </div>
  </div>
</template>

<style scoped>
.settings-tabs { display: flex; gap: 4px; padding: 3px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); width: fit-content; margin-bottom: 14px; }

.profile-cols { display: grid; grid-template-columns: 240px 1fr; gap: 14px; }
.role-list { display: flex; flex-direction: column; gap: 4px; }
.role-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; background: var(--panel); border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm); cursor: pointer; color: var(--text);
  font-family: var(--sans); font-size: 13px; text-align: left;
}
.role-row:hover { background: var(--panel-2); }
.role-row.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.role-row .badge { margin-left: auto; font-size: 10.5px; }

.profile-detail { min-height: 400px; }
.provider-tabs { display: flex; gap: 4px; padding: 3px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); width: fit-content; margin-bottom: 14px; }

.field { margin-bottom: 12px; }
.field-label { display: block; font-size: 12.5px; font-weight: 600; color: var(--dim); margin-bottom: 4px; }
.field-row { display: flex; gap: 6px; align-items: center; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.check-row { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.action-row { display: flex; gap: 8px; align-items: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-soft); }

.test-result { display: flex; gap: 8px; padding: 10px 12px; border-radius: var(--radius-sm); margin-top: 12px; }
.test-result.ok { background: color-mix(in srgb, var(--green) 10%, transparent); border: 1px solid color-mix(in srgb, var(--green) 30%, transparent); }
.test-result.err { background: color-mix(in srgb, var(--red) 10%, transparent); border: 1px solid color-mix(in srgb, var(--red) 30%, transparent); }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

@media (max-width: 768px) { .profile-cols { grid-template-columns: 1fr; } .field-grid { grid-template-columns: 1fr; } }
</style>
