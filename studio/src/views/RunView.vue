<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  ArrowRight, ExternalLink, Pause, Play, PlayCircle, Square,
  Terminal, Zap, ShieldCheck, Activity,
} from "lucide-vue-next";
import ScreenHeader from "@/components/ScreenHeader.vue";
import {
  getActiveRuns, getApproval, getProfiles, getRunState,
  launchWorkflow, pauseRun, resumeRun, stopRun,
} from "@/lib/api";
import { go, nav } from "@/lib/nav";
import type {
  ApprovalRecordV2, ConnectionProfileStore, LiveRunState,
} from "@shared/types.ts";

const approval = ref<ApprovalRecordV2 | null>(null);
const profiles = ref<ConnectionProfileStore | null>(null);
const currentRun = ref<LiveRunState | null>(null);
const launching = ref(false);
const autoScroll = ref(true);
const windowsHost = /Windows/i.test(navigator.userAgent);
const terminalContainer = ref<HTMLDivElement | null>(null);
let pollInterval: any = null;

const tokenCap = computed(() => profiles.value?.defaultTokenCap ?? 20000);
const usagePct = computed(() => {
  if (!currentRun.value?.tokenCap || !currentRun.value?.tokenUsage) return 0;
  return Math.min(100, Math.round((currentRun.value.tokenUsage / currentRun.value.tokenCap) * 100));
});

onMounted(async () => {
  // Load approval if present in nav
  if (nav.value.approvalId) {
    try { approval.value = await getApproval(nav.value.approvalId); } catch {}
  }
  try { profiles.value = await getProfiles(); } catch {}
  // Pick up an active run
  try {
    const runs = await getActiveRuns();
    if (runs.length) currentRun.value = runs[0];
  } catch {}

  pollInterval = setInterval(async () => {
    if (currentRun.value && (currentRun.value.status === "running" || currentRun.value.status === "paused")) {
      try {
        const state = await getRunState(currentRun.value.runId);
        if (state) currentRun.value = state;
        if (autoScroll.value && terminalContainer.value) {
          terminalContainer.value.scrollTop = terminalContainer.value.scrollHeight;
        }
      } catch {}
    }
  }, 1000);
});

onUnmounted(() => { if (pollInterval) clearInterval(pollInterval); });

async function handleLaunch() {
  if (!approval.value) {
    alert("No approval recorded for this run. Go to Review & Approve first.");
    return;
  }
  if (launching.value) return;
  if (!confirm(`Start this approved job using your saved connections and a ${tokenCap.value.toLocaleString()} token cap? Provider usage reporting can lag. Crew will work in the selected project.`)) return;
  launching.value = true;
  try {
    const run = await launchWorkflow({
      workflowId: approval.value.workflowId,
      promptMode: "approved-spec",
      specPath: "",
      approvalId: approval.value.id,
      tokenCap: tokenCap.value,
    } as any);
    currentRun.value = run;
  } catch (e: any) {
    alert("That didn't work: " + e.message);
  } finally {
    launching.value = false;
  }
}

async function handleStop() {
  if (!currentRun.value) return;
  try { await stopRun(currentRun.value.runId); } catch (e: any) { alert(e.message); }
  currentRun.value = await getRunState(currentRun.value.runId) ?? currentRun.value;
}
async function handlePause() {
  if (!currentRun.value) return;
  try { await pauseRun(currentRun.value.runId); } catch (e: any) { alert(e.message); }
  currentRun.value = await getRunState(currentRun.value.runId) ?? currentRun.value;
}
async function handleResume() {
  if (!currentRun.value) return;
  try { await resumeRun(currentRun.value.runId); } catch (e: any) { alert(e.message); }
  currentRun.value = await getRunState(currentRun.value.runId) ?? currentRun.value;
}
function openResults() {
  if (currentRun.value?.adwId) {
    go("results", { adwId: currentRun.value.adwId, runId: currentRun.value.runId });
  } else {
    go("results");
  }
}
</script>

<template>
  <div>
    <ScreenHeader screen="run">
      <template #actions>
        <template v-if="currentRun?.status === 'running' || currentRun?.status === 'paused'">
          <button v-if="currentRun.status === 'running' && !windowsHost" class="btn btn-secondary btn-sm" @click="handlePause">
            <Pause :size="14" /> Pause
          </button>
          <button v-else-if="currentRun.status === 'paused'" class="btn btn-secondary btn-sm" @click="handleResume">
            <Play :size="14" /> Resume
          </button>
          <button class="btn btn-danger btn-sm" @click="handleStop">
            <Square :size="14" /> Stop
          </button>
          <span v-if="windowsHost" class="dim">Windows: use Stop to end a job.</span>
        </template>
        <button v-if="currentRun && currentRun.status !== 'running' && currentRun.status !== 'paused'" class="btn btn-primary btn-sm" @click="openResults">
          See results <ArrowRight :size="14" />
        </button>
      </template>
    </ScreenHeader>

    <!-- Approval banner -->
    <div v-if="approval" class="callout" style="margin-bottom: 14px;">
      <ShieldCheck :size="16" style="vertical-align: middle; margin-right: 6px;" />
      <strong>Approved v{{ approval.specVersion }}</strong> by {{ approval.approvedBy }} — workflow {{ approval.workflowName }}.
      The server will reject any run without this recorded approval.
    </div>
    <div v-else class="callout warn" style="margin-bottom: 14px;">
      <ShieldCheck :size="16" style="vertical-align: middle; margin-right: 6px;" />
      No approval selected. Go to Review &amp; Approve first — the server won't run anything without one.
      <button class="btn btn-ghost btn-xs" style="margin-left: 8px;" @click="go('review-approve')">Go to Review</button>
    </div>

    <!-- Two columns: control + terminal -->
    <div class="run-grid">
      <div class="control-side">
        <div class="section-card">
          <div class="section-label">Ready to run</div>
          <div v-if="approval" style="font-size: 14px; line-height: 1.6;">
            <strong>{{ approval.workflowName }}</strong>
            <div class="dim" style="font-size: 12.5px; margin-top: 4px;">
              "{{ approval.specTitle }}" (v{{ approval.specVersion }})
            </div>
          </div>
          <button
            class="btn btn-primary"
            style="margin-top: 12px; width: 100%;"
            :disabled="launching || !approval || currentRun?.status === 'running' || currentRun?.status === 'paused'"
            @click="handleLaunch"
            data-tour="run-launch"
          >
            <PlayCircle :size="16" />
            {{ launching ? "Spawning…" : "Run the approved job" }}
          </button>
        </div>

        <div class="section-card" style="margin-top: 14px;" data-tour="run-token-guard">
          <div class="section-label">Token guard</div>
          <div class="guard-row">
            <div>
              <div class="dim" style="font-size: 12.5px;">Cap for this run</div>
              <div style="font-size: 18px; font-weight: 700;">{{ tokenCap.toLocaleString() }}</div>
              <div class="dim" style="font-size: 11.5px;">change in Settings</div>
            </div>
            <div style="text-align: right;">
              <div class="dim" style="font-size: 12.5px;">Used so far</div>
              <div style="font-size: 18px; font-weight: 700;">{{ (currentRun?.tokenUsage ?? 0).toLocaleString() }}</div>
              <div class="dim" style="font-size: 11.5px;">{{ usagePct }}% of cap</div>
            </div>
          </div>
          <div class="guard-bar">
            <div class="guard-bar-fill" :style="{ width: usagePct + '%' }" :class="{ near: usagePct > 80 }"></div>
          </div>
          <p class="dim" style="font-size: 12.5px; margin-top: 8px;">
            When usage reaches the cap, the run stops with a calm message. Raise the cap in Settings, or approve a smaller spec.
          </p>
        </div>

        <div class="section-card" style="margin-top: 14px;">
          <div class="section-label">Run status</div>
          <div v-if="currentRun" style="font-size: 13px;">
            <div><span class="dim">Run ID:</span> <span class="mono">{{ currentRun.runId }}</span></div>
            <div><span class="dim">ADW ID:</span> <span class="mono">{{ currentRun.adwId || "—" }}</span></div>
            <div><span class="dim">Status:</span>
              <span class="badge" :class="currentRun.status === 'running' ? 'badge-amber' : currentRun.status === 'success' ? 'badge-green' : currentRun.status === 'paused' ? 'badge-blue' : 'badge-red'">
                {{ currentRun.status }}
              </span>
              <span v-if="currentRun.stopReason" class="badge">{{ currentRun.stopReason }}</span>
            </div>
            <div v-if="currentRun.currentPhase"><span class="dim">Phase:</span> <span class="mono">{{ currentRun.currentPhase }}</span></div>
            <div v-if="currentRun.adwId">
              <button class="btn btn-ghost btn-xs" style="margin-top: 6px;" @click="openResults">
                <ExternalLink :size="12" /> Open in Results / Sessions
              </button>
            </div>
          </div>
          <div v-else class="dim" style="font-size: 13px;">No run yet. Click "Run the approved job" to start.</div>
        </div>
      </div>

      <div class="terminal-side">
        <div class="terminal-header">
          <Terminal :size="14" />
          <strong>Live console</strong>
          <span class="badge" :class="currentRun?.status === 'running' ? 'badge-amber' : currentRun?.status === 'success' ? 'badge-green' : 'badge-red'" v-if="currentRun">
            {{ currentRun.status }}
          </span>
          <label style="margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dim); cursor: pointer;">
            <input type="checkbox" v-model="autoScroll" /> Auto-scroll
          </label>
        </div>
        <div ref="terminalContainer" class="terminal-body">
          <div v-if="currentRun && currentRun.logs.length" class="log-lines">
            <div
              v-for="(line, idx) in currentRun.logs"
              :key="idx"
              class="log-line"
              :class="{
                'log-crew': line.startsWith('[crew]') || line.startsWith('[studio]'),
                'log-ok': line.includes('✓') || line.toLowerCase().includes('success'),
                'log-err': line.toLowerCase().includes('error') || line.toLowerCase().includes('✗') || line.toLowerCase().includes('fail'),
                'log-warn': line.includes('▶') || line.toLowerCase().includes('warn'),
              }"
            >{{ line }}</div>
          </div>
          <div v-else class="empty-terminal">
            <Terminal :size="32" />
            <div class="dim" style="margin-top: 6px;">No active run. Click "Run the approved job" on the left.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.run-grid {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
}
.control-side { display: flex; flex-direction: column; gap: 14px; }
.guard-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.guard-bar { height: 8px; background: var(--panel-3); border: 1px solid var(--border-soft); border-radius: 4px; overflow: hidden; }
.guard-bar-fill { height: 100%; background: var(--sage); transition: width 0.3s ease; }
.guard-bar-fill.near { background: var(--amber); }

.terminal-side { background: var(--panel-3); border: 1px solid var(--border); border-radius: var(--radius); display: flex; flex-direction: column; overflow: hidden; min-height: 480px; }
.terminal-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--panel); border-bottom: 1px solid var(--border); font-size: 12.5px; }
.terminal-body { flex: 1; overflow-y: auto; padding: 14px 16px; font-family: var(--mono); font-size: 12.5px; line-height: 1.55; background: var(--bg-soft); min-height: 400px; }
.log-lines { display: flex; flex-direction: column; gap: 1px; }
.log-line { white-space: pre-wrap; word-break: break-all; color: var(--text); }
.log-crew { color: var(--accent); font-weight: 600; }
.log-ok { color: var(--green); }
.log-err { color: var(--red); }
.log-warn { color: var(--amber); }
.empty-terminal { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--faint); }

@media (max-width: 900px) { .run-grid { grid-template-columns: 1fr; } .terminal-side { min-height: 320px; } }
</style>
