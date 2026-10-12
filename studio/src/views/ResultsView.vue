<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  ArrowRight, CheckCircle2, Clock, ExternalLink, ListChecks,
  PlayCircle, RotateCcw, XCircle, Zap,
} from "lucide-vue-next";
import ScreenHeader from "@/components/ScreenHeader.vue";
import {
  fetchSession, getActiveRuns, getApproval, getRunState,
  getWorkflows,
} from "@/lib/api";
import { fmtCost, fmtDuration, fmtTokens, ts } from "@/lib/format";
import { go, nav } from "@/lib/nav";
import type {
  AdwWorkflowInfo, ApprovalRecordV2, LiveRunState, SessionDetail,
} from "@shared/types.ts";

const run = ref<LiveRunState | null>(null);
const session = ref<SessionDetail | null>(null);
const approval = ref<ApprovalRecordV2 | null>(null);
const workflows = ref<AdwWorkflowInfo[]>([]);
const loading = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    workflows.value = await getWorkflows();
    if (nav.value.runId) {
      try { run.value = await getRunState(nav.value.runId); } catch {}
    } else {
      const runs = await getActiveRuns();
      const latestDone = runs.find(r => r.status === "success" || r.status === "fail" || r.status === "stopped");
      if (latestDone) run.value = latestDone;
      else if (runs.length) run.value = runs[0];
    }
    if (run.value?.approvalId) {
      try { approval.value = await getApproval(run.value.approvalId); } catch {}
    }
    if (run.value?.adwId) {
      try { session.value = await fetchSession(run.value.adwId); } catch {}
    }
  } finally { loading.value = false; }
});

const runMs = computed(() => {
  if (!run.value?.endedAt) return NaN;
  return ts(run.value.endedAt) - ts(run.value.startedAt);
});

const phasesCount = computed(() => session.value?.phases?.length ?? 0);
const passedGates = computed(() => session.value?.gate_results?.filter(g => g.passed).length ?? 0);
const totalGates = computed(() => session.value?.gate_results?.length ?? 0);
</script>

<template>
  <div>
    <ScreenHeader screen="results">
      <template #actions>
        <button v-if="run?.adwId" class="btn btn-secondary btn-sm" @click="go('sessions', { adwId: run.adwId })">
          <ExternalLink :size="14" /> Full trace
        </button>
        <button class="btn btn-primary btn-sm" @click="go('new-job')">
          <PlayCircle :size="14" /> Start another job <ArrowRight :size="14" />
        </button>
      </template>
    </ScreenHeader>

    <div v-if="loading" class="dim">Loading…</div>
    <div v-else-if="!run" class="callout">
      No run yet. Start one from <button class="btn btn-ghost btn-xs" @click="go('run')">Run</button>.
    </div>
    <template v-else>
      <div class="breadcrumbs">
        <button @click="go('run')">Run</button>
        <span class="crumb-sep">›</span>
        <span class="crumb-current">Results — <span class="mono">{{ run.adwId || run.runId }}</span></span>
      </div>

      <!-- Status banner -->
      <div class="status-banner" :class="run.status">
        <component :is="run.status === 'success' ? CheckCircle2 : run.status === 'fail' ? XCircle : RotateCcw" :size="22" />
        <div>
          <div class="status-name">{{ run.status === 'success' ? 'Done' : run.status === 'fail' ? 'Failed' : run.status === 'stopped' ? 'Stopped' : 'Running' }}</div>
          <div class="dim" style="font-size: 13px;">
            {{ run.workflowName }}
            <span v-if="run.stopReason === 'token-cap'">— stopped at the token cap</span>
            <span v-else-if="run.stopReason === 'user-stop'">— stopped by you</span>
          </div>
        </div>
        <div v-if="Number.isFinite(runMs)" class="status-time">
          <Clock :size="14" /> {{ fmtDuration(runMs) }}
        </div>
      </div>

      <!-- Quick stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Exit code</div>
          <div class="stat-value">{{ run.exitCode ?? "—" }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Phases</div>
          <div class="stat-value">{{ phasesCount }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Gates passed</div>
          <div class="stat-value">{{ passedGates }} / {{ totalGates }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Tokens used</div>
          <div class="stat-value">{{ fmtTokens(run.tokenUsage ?? null) }} <span class="dim" style="font-size: 12px;">/ {{ fmtTokens(run.tokenCap ?? null) }}</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Cost</div>
          <div class="stat-value">{{ fmtCost(session?.session?.total_cost ?? null) }}</div>
        </div>
      </div>

      <!-- Approval reference -->
      <div v-if="approval" class="section-card" style="margin-top: 14px;">
        <div class="section-label">Approved by</div>
        <div style="display: flex; align-items: center; gap: 10px; font-size: 13.5px;">
          <ListChecks :size="16" />
          <strong>{{ approval.specTitle }}</strong> v{{ approval.specVersion }}
          <span class="dim">by {{ approval.approvedBy }}</span>
          <span class="dim">on {{ new Date(approval.approvedAt).toLocaleString() }}</span>
        </div>
      </div>

      <!-- Phase summary -->
      <div v-if="session?.phases?.length" class="section-card" style="margin-top: 14px;">
        <div class="section-label">Phases</div>
        <div class="phases-list">
          <div v-for="p in session.phases" :key="p.phase_id" class="phase-row" :class="p.status ?? ''">
            <span class="phase-seq">{{ p.seq ?? "·" }}</span>
            <span class="phase-name">{{ p.name }}</span>
            <span class="badge" :class="p.status === 'success' ? 'badge-green' : p.status === 'fail' ? 'badge-red' : p.status === 'running' ? 'badge-amber' : ''">{{ p.status }}</span>
            <span class="dim" style="font-size: 12px;">{{ p.owner }}</span>
          </div>
        </div>
      </div>

      <!-- What to do next -->
      <div class="section-card" style="margin-top: 14px;">
        <div class="section-label">What to do next</div>
        <ul class="next-list">
          <li v-if="run.status === 'success'">
            <CheckCircle2 :size="14" /> The job finished cleanly. Open the full trace to inspect what changed.
          </li>
          <li v-if="run.status === 'fail'">
            <XCircle :size="14" /> The job failed. Check the live console on the Run screen for the error, then start a smaller or clearer job.
          </li>
          <li v-if="run.stopReason === 'token-cap'">
            <Zap :size="14" /> Hit the token cap. Raise it in Settings or approve a smaller spec, then run again.
          </li>
          <li>
            <RotateCcw :size="14" /> Start another job from New Job. Drafts auto-save, so you won't lose your work.
          </li>
        </ul>
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button v-if="run.adwId" class="btn btn-secondary btn-sm" @click="go('sessions', { adwId: run.adwId })">
            <ExternalLink :size="14" /> Full trace
          </button>
          <button class="btn btn-primary btn-sm" @click="go('new-job')">
            Start another job <ArrowRight :size="14" />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.status-banner {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 18px; background: var(--panel); border: 1px solid var(--border);
  border-left: 4px solid var(--accent); border-radius: var(--radius);
  margin-bottom: 14px;
}
.status-banner.success { border-left-color: var(--green); }
.status-banner.fail { border-left-color: var(--red); }
.status-banner.stopped { border-left-color: var(--amber); }
.status-name { font-size: 18px; font-weight: 700; }
.status-time { margin-left: auto; display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--dim); }

.stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.stat-card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; }
.stat-label { font-size: 11.5px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.04em; }
.stat-value { font-size: 18px; font-weight: 700; margin-top: 2px; }

.phases-list { display: flex; flex-direction: column; gap: 4px; }
.phase-row { display: grid; grid-template-columns: 24px 1fr auto auto; align-items: center; gap: 10px; padding: 6px 10px; background: var(--panel); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); font-size: 13px; }
.phase-row.success { border-left: 3px solid var(--green); }
.phase-row.fail { border-left: 3px solid var(--red); }
.phase-row.running { border-left: 3px solid var(--amber); }
.phase-seq { color: var(--faint); font-family: var(--mono); font-size: 12px; }
.phase-name { font-weight: 600; }

.next-list { padding-left: 18px; margin: 0; }
.next-list li { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; font-size: 13px; color: var(--dim); line-height: 1.55; }

@media (max-width: 768px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
