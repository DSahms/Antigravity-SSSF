<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  History,
  RotateCcw,
  Zap,
} from "lucide-vue-next";
import type { ApprovalRecord, LiveRunState } from "@shared/types.ts";
import { getDiscoveryHistory, getProjectInfo } from "@/lib/api";
import { formatTimeAgo } from "@/lib/format";

const emit = defineEmits<{
  (e: "launch-spec", specPath: string): void;
  (e: "view-session", adwId: string): void;
}>();

const approvals = ref<ApprovalRecord[]>([]);
const selectedApproval = ref<ApprovalRecord | null>(null);
const loading = ref(false);

onMounted(async () => {
  await loadHistory();
});

async function loadHistory() {
  try {
    loading.value = true;
    approvals.value = await getDiscoveryHistory();
    if (approvals.value.length > 0) {
      selectedApproval.value = approvals.value[0];
    }
  } catch (err) {
    console.error("Failed to load history:", err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="history-container">
    <div class="history-header">
      <div class="flex items-center gap-3">
        <History class="w-5 h-5 text-indigo-400" />
        <div>
          <h2 class="text-xl font-bold tracking-wide">Discovery & Execution Audit History</h2>
          <p class="text-xs text-zinc-400">
            Immutable log of all human approvals, specification revisions, and factory execution traces.
          </p>
        </div>
      </div>
      <button class="btn btn-secondary text-xs" @click="loadHistory">
        <RotateCcw class="w-3.5 h-3.5" />
        Refresh
      </button>
    </div>

    <div class="history-grid">
      <!-- Approvals List -->
      <div class="list-side">
        <div class="section-card">
          <div class="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
            <span class="font-bold text-xs uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <FileCheck class="w-4 h-4 text-emerald-400" />
              Approved Specifications ({{ approvals.length }})
            </span>
          </div>

          <div v-if="approvals.length" class="space-y-2 overflow-y-auto max-h-[620px]">
            <div
              v-for="appr in approvals"
              :key="appr.id"
              class="history-card"
              :class="{ selected: selectedApproval?.id === appr.id }"
              @click="selectedApproval = appr"
            >
              <div class="flex items-start justify-between gap-2">
                <span class="font-bold text-sm text-zinc-200">{{ appr.specTitle }}</span>
                <span class="badge badge-green text-xs font-mono">Approved</span>
              </div>
              <p class="text-xs text-zinc-400 mt-1 line-clamp-2">{{ appr.summary }}</p>
              <div class="flex items-center justify-between text-xs text-zinc-500 mt-2">
                <span>By {{ appr.approvedBy }}</span>
                <span>{{ formatTimeAgo(appr.timestamp) }}</span>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-12 text-zinc-500 text-xs">
            No specifications approved yet. Use the Discovery tab to craft and approve your first spec.
          </div>
        </div>
      </div>

      <!-- Detail Preview Pane -->
      <div class="detail-side">
        <div class="section-card h-full flex flex-col" v-if="selectedApproval">
          <div class="flex items-center justify-between mb-3 border-b border-zinc-800 pb-3">
            <div>
              <h3 class="text-lg font-bold text-zinc-100">{{ selectedApproval.specTitle }}</h3>
              <p class="text-xs text-zinc-400 font-mono mt-0.5">
                Saved to: <code>{{ selectedApproval.savedFilePath }}</code>
              </p>
            </div>

            <div class="flex items-center gap-2">
              <button
                class="btn btn-primary text-xs"
                @click="emit('launch-spec', selectedApproval.savedFilePath)"
              >
                <Zap class="w-3.5 h-3.5" />
                Launch Workflow
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto bg-zinc-950 p-4 rounded border border-zinc-850">
            <pre class="preview-text">{{ selectedApproval.content }}</pre>
          </div>
        </div>

        <div v-else class="section-card h-full flex items-center justify-center text-zinc-500 text-xs">
          Select an approval record on the left to inspect its contents.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: calc(100vh - 120px);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.history-grid {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.section-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.history-card {
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.history-card:hover {
  border-color: var(--border);
  background: var(--panel-2);
}
.history-card.selected {
  border-color: var(--indigo);
  background: rgba(99, 102, 241, 0.08);
}

.preview-text {
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.6;
  color: #e2e8f0;
  white-space: pre-wrap;
  background: transparent;
  border: none;
  padding: 0;
}
</style>
