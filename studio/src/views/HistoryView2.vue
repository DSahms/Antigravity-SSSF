<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  ArrowRight, CheckCircle2, Clock, FileText, History, ListChecks,
  PlayCircle, RotateCcw, Zap,
} from "lucide-vue-next";
import ScreenHeader from "@/components/ScreenHeader.vue";
import { getDiscoveryHistory, listApprovals, getProjectInfo } from "@/lib/api";
import { formatTimeAgo } from "@/lib/format";
import type {
  ApprovalBookSummary, ApprovalRecord, TargetProject,
} from "@shared/types.ts";
import { go } from "@/lib/nav";

const legacyApprovals = ref<ApprovalRecord[]>([]);
const v2Approvals = ref<ApprovalBookSummary[]>([]);
const project = ref<TargetProject | null>(null);
const loading = ref(false);

const selected = ref<{ kind: "v2" | "legacy"; id: string; title: string; content?: string; savedFilePath?: string; summary?: string; approvedBy?: string; timestamp?: string; specVersion?: number } | null>(null);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const [leg, v2, proj] = await Promise.all([
      getDiscoveryHistory(),
      listApprovals(),
      getProjectInfo(),
    ]);
    legacyApprovals.value = leg;
    v2Approvals.value = v2;
    project.value = proj;
    // Default selection: most recent v2 if any, else most recent legacy
    if (v2.length) {
      const a = v2[0];
      selected.value = { kind: "v2", id: a.id, title: a.specTitle, specVersion: a.specVersion, approvedBy: a.approvedBy, timestamp: a.approvedAt };
    } else if (leg.length) {
      const a = leg[0];
      selected.value = { kind: "legacy", id: a.id, title: a.specTitle, content: a.content, savedFilePath: a.savedFilePath, summary: a.summary, approvedBy: a.approvedBy, timestamp: a.timestamp };
    }
  } catch (e) {
    console.error("History load failed:", e);
  } finally {
    loading.value = false;
  }
}

function selectV2(a: ApprovalBookSummary) {
  selected.value = { kind: "v2", id: a.id, title: a.specTitle, specVersion: a.specVersion, approvedBy: a.approvedBy, timestamp: a.approvedAt };
}
function selectLegacy(a: ApprovalRecord) {
  selected.value = { kind: "legacy", id: a.id, title: a.specTitle, content: a.content, savedFilePath: a.savedFilePath, summary: a.summary, approvedBy: a.approvedBy, timestamp: a.timestamp };
}
</script>

<template>
  <div>
    <ScreenHeader screen="history" hide-step>
      <template #actions>
        <button class="btn btn-secondary btn-sm" @click="load">
          <RotateCcw :size="14" /> Refresh
        </button>
      </template>
    </ScreenHeader>

    <div class="history-grid">
      <div class="section-card list-side">
        <div class="section-label">Recorded approvals (v2)</div>
        <div v-if="v2Approvals.length">
          <div v-for="a in v2Approvals" :key="a.id" class="hist-card" :class="{ active: selected?.id === a.id && selected?.kind === 'v2' }" @click="selectV2(a)">
            <div class="hist-row">
              <strong>{{ a.specTitle }}</strong>
              <span class="badge badge-green">v{{ a.specVersion }}</span>
            </div>
            <div class="hist-meta">
              <span v-if="a.withdrawnAt" class="badge badge-red">withdrawn</span>
              <span class="dim">by {{ a.approvedBy }}</span>
              <span class="dim"><Clock :size="11" /> {{ formatTimeAgo(a.approvedAt) }}</span>
            </div>
            <div class="hist-meta">
              <span class="badge">{{ a.workflowName }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">No v2 approvals yet.</div>

        <div class="section-label" style="margin-top: 16px;">Earlier approvals (legacy)</div>
        <div v-if="legacyApprovals.length">
          <div v-for="a in legacyApprovals" :key="a.id" class="hist-card" :class="{ active: selected?.id === a.id && selected?.kind === 'legacy' }" @click="selectLegacy(a)">
            <div class="hist-row">
              <strong>{{ a.specTitle }}</strong>
              <span class="badge">legacy</span>
            </div>
            <div class="hist-meta">
              <span class="dim">by {{ a.approvedBy }}</span>
              <span class="dim"><Clock :size="11" /> {{ formatTimeAgo(a.timestamp) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">No legacy approvals.</div>
      </div>

      <div class="section-card detail-side">
        <div v-if="selected">
          <div class="detail-header">
            <div>
              <h3>{{ selected.title }}</h3>
              <div class="dim mono" style="font-size: 12px; margin-top: 4px;">
                <span v-if="selected.specVersion">version {{ selected.specVersion }} · </span>
                by {{ selected.approvedBy }} · {{ formatTimeAgo(selected.timestamp) }}
              </div>
            </div>
            <div class="detail-actions">
              <button v-if="selected.kind === 'v2'" class="btn btn-secondary btn-sm" @click="go('review-approve', { approvalId: selected.id })">
                <ListChecks :size="14" /> Open
              </button>
              <button v-if="selected.kind === 'legacy' && selected.savedFilePath" class="btn btn-primary btn-sm" @click="go('run', { specPath: selected.savedFilePath })">
                <PlayCircle :size="14" /> Launch
                <ArrowRight :size="14" />
              </button>
            </div>
          </div>
          <pre v-if="selected.content" class="detail-content">{{ selected.content }}</pre>
          <div v-else class="callout">
            This is a v2 approval. Open it in Review &amp; Approve to see the full spec, sections, and summary.
          </div>
        </div>
        <div v-else class="empty-state">Select an approval on the left to inspect it.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-grid {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
}
.list-side { max-height: 70vh; overflow-y: auto; }
.hist-card {
  padding: 10px 12px; background: var(--panel); border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm); margin-bottom: 6px; cursor: pointer;
}
.hist-card:hover { border-color: var(--border); background: var(--panel-2); }
.hist-card.active { border-color: var(--accent); background: var(--accent-soft); }
.hist-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.hist-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 12px; color: var(--dim); flex-wrap: wrap; }
.detail-side { min-height: 400px; display: flex; flex-direction: column; }
.detail-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border-soft); margin-bottom: 12px; }
.detail-content { flex: 1; overflow: auto; max-height: 60vh; font-size: 12.5px; line-height: 1.6; }
.empty-state { padding: 24px; text-align: center; color: var(--dim); font-size: 13px; }
@media (max-width: 768px) { .history-grid { grid-template-columns: 1fr; } }
</style>
