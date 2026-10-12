<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import {
  ArrowLeft, ChevronRight, Database, Radio,
} from "lucide-vue-next";
import ScreenHeader from "@/components/ScreenHeader.vue";
import SessionsList from "@/components/visualizer/SessionsList.vue";
import SessionTrace from "@/components/visualizer/SessionTrace.vue";
import { getHealth } from "@/lib/api";
import type { HealthResponse } from "@shared/types.ts";
import { nav } from "@/lib/nav";

const currentAdwId = ref<string | null>(nav.value.adwId ?? null);
const currentPhaseId = ref<string | null>(null);
const health = ref<HealthResponse | null>(null);

watch(() => nav.value.adwId, (v) => { if (v) currentAdwId.value = v; });

onMounted(async () => {
  try { health.value = await getHealth(); } catch {}
});

function selectSession(adwId: string) {
  currentAdwId.value = adwId;
  currentPhaseId.value = null;
  nav.value = { ...nav.value, adwId };
}
function clearSession() {
  currentAdwId.value = null;
  currentPhaseId.value = null;
  const { adwId, ...rest } = nav.value;
  nav.value = rest;
}
</script>

<template>
  <div>
    <ScreenHeader screen="sessions" hide-step />

    <div class="breadcrumbs" aria-label="Breadcrumb">
      <button @click="clearSession">Sessions</button>
      <template v-if="currentAdwId">
        <ChevronRight :size="14" class="crumb-sep" />
        <span class="crumb-current mono">{{ currentAdwId }}</span>
      </template>
    </div>

    <div class="obs-header">
      <div class="obs-header-left">
        <button v-if="currentAdwId" class="btn btn-secondary btn-xs" @click="clearSession">
          <ArrowLeft :size="14" /> All Sessions
        </button>
      </div>
      <div class="obs-header-right">
        <div class="badge" v-if="health">
          <Database :size="12" />
          <span class="mono">{{ health.db }}</span>
          <span class="badge badge-purple">{{ health.journal_mode }}</span>
        </div>
        <div class="badge badge-green">
          <Radio :size="12" /> Live
        </div>
      </div>
    </div>

    <div class="obs-body">
      <SessionsList v-if="!currentAdwId" @select="selectSession" />
      <SessionTrace v-else :key="currentAdwId" :adw-id="currentAdwId" :phase-id="currentPhaseId" />
    </div>
  </div>
</template>

<style scoped>
.obs-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
  margin-bottom: 12px;
}
.obs-header-right { display: flex; align-items: center; gap: 10px; }
.obs-body {
  min-height: 600px;
  background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden;
}
</style>
