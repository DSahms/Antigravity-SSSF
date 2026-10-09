<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  Database,
  Radio,
  RefreshCw,
} from "lucide-vue-next";
import SessionsList from "@/components/visualizer/SessionsList.vue";
import SessionTrace from "@/components/visualizer/SessionTrace.vue";
import { getHealth } from "@/lib/api";
import type { HealthResponse } from "@shared/types.ts";

const props = defineProps<{
  initialAdwId?: string | null;
}>();

const currentAdwId = ref<string | null>(props.initialAdwId ?? null);
const currentPhaseId = ref<string | null>(null);
const health = ref<HealthResponse | null>(null);

watch(
  () => props.initialAdwId,
  (newId) => {
    if (newId) {
      currentAdwId.value = newId;
    }
  },
);

onMounted(async () => {
  try {
    health.value = await getHealth();
  } catch {}
});

function selectSession(adwId: string) {
  currentAdwId.value = adwId;
  currentPhaseId.value = null;
}

function clearSession() {
  currentAdwId.value = null;
  currentPhaseId.value = null;
}
</script>

<template>
  <div class="observability-container">
    <!-- Sub-header Breadcrumb Bar -->
    <div class="obs-header">
      <div class="header-left">
        <button
          v-if="currentAdwId"
          class="btn btn-secondary text-xs py-1 px-2.5 mr-2"
          @click="clearSession"
        >
          <ArrowLeft class="w-3.5 h-3.5" />
          All Sessions
        </button>

        <nav class="crumbs">
          <span class="crumb-root" @click="clearSession">SSSF Trace</span>
          <ChevronRight class="w-3.5 h-3.5 text-zinc-600" />
          <span :class="{ 'text-indigo-400 font-bold': !currentAdwId, 'text-zinc-400': currentAdwId }">
            Sessions
          </span>

          <template v-if="currentAdwId">
            <ChevronRight class="w-3.5 h-3.5 text-zinc-600" />
            <span class="font-mono text-indigo-400 font-bold">{{ currentAdwId }}</span>
          </template>
        </nav>
      </div>

      <div class="header-right">
        <div class="db-chip" v-if="health">
          <Database class="w-3.5 h-3.5 text-zinc-400" />
          <span class="text-zinc-300 font-mono text-xs">{{ health.db }}</span>
          <span class="badge badge-purple text-xs font-mono">{{ health.journal_mode }}</span>
        </div>

        <div class="live-indicator">
          <span class="pulse-dot"></span>
          <span class="text-xs font-bold uppercase tracking-wider text-emerald-400">Live Polling</span>
        </div>
      </div>
    </div>

    <!-- Main Visualizer Content -->
    <div class="obs-body">
      <SessionsList v-if="!currentAdwId" @select="selectSession" />
      <SessionTrace
        v-else
        :key="currentAdwId"
        :adw-id="currentAdwId"
        :phase-id="currentPhaseId"
      />
    </div>
  </div>
</template>

<style scoped>
.observability-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 120px);
}

.obs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.header-left {
  display: flex;
  align-items: center;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.crumb-root {
  font-weight: 700;
  background: linear-gradient(90deg, var(--purple), var(--cyan));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  cursor: pointer;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.db-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--panel-3);
  border: 1px solid var(--border-soft);
  padding: 3px 8px;
  border-radius: 4px;
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.2);
  padding: 4px 10px;
  border-radius: 12px;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: var(--green);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--green);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.9); opacity: 0.7; }
  50% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.7; }
}

.obs-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-radius: 8px;
}
</style>
