<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, ListChecks,
  ShieldCheck, ShieldAlert, Zap, Undo2, AlertTriangle,
} from "lucide-vue-next";
import ScreenHeader from "@/components/ScreenHeader.vue";
import {
  getDiscoverySession, getWorkflows, getApproval, createApproval,
  withdrawApproval, listApprovals,
} from "@/lib/api";
import { go, nav } from "@/lib/nav";
import type {
  AdwWorkflowInfo, ApprovalRecordV2, DiscoverySessionState,
} from "@shared/types.ts";

const session = ref<DiscoverySessionState | null>(null);
const workflows = ref<AdwWorkflowInfo[]>([]);
const selectedWorkflowId = ref("adw_simple_sdlc.py");
const loading = ref(false);
const approving = ref(false);

// Per-section checkmarks (computed from the spec's markdown sections)
const sectionChecks = ref<Record<string, boolean>>({});
const QUALITY_WORKFLOWS = new Set(["adw_simple_sdlc.py", "adw_simple_sdlc_rea.py", "adw_verify_sdlc.py", "adw_plan_build_test_quality.py", "adw_plan_build_test.py", "adw_build_test.py", "adw_quality.py"]);

// Summary text (user can edit but doesn't have to)
const summary = ref({
  willHappen: "",
  willUse: "",
  willNotDo: "",
  timeEstimate: "",
  costEstimate: "",
  canUndo: "",
  cannotUndo: "",
});

// The final approval checkbox (in words)
const finalConfirm = ref(false);

// Recorded approval (after the user approves)
const recordedApproval = ref<ApprovalRecordV2 | null>(null);
const existingApprovalId = ref<string | null>(nav.value.approvalId ?? null);
const existingApprovalsList = ref<any[]>([]);

onMounted(async () => {
  loading.value = true;
  try {
    const [sess, wfs, aps] = await Promise.all([
      getDiscoverySession(), getWorkflows(), listApprovals(),
    ]);
    session.value = sess;
    workflows.value = wfs;
    existingApprovalsList.value = aps;
    if (wfs.length) {
      const recommended = wfs.find(w => w.badge === "Recommended") ?? wfs[0];
      selectedWorkflowId.value = recommended.id;
    }
    parseSections(sess.specMarkdown);
    prefillSummary(sess);
    // If we arrived with an existing approvalId, load it
    if (existingApprovalId.value) {
      try {
        recordedApproval.value = await getApproval(existingApprovalId.value);
        if (recordedApproval.value) {
          selectedWorkflowId.value = recordedApproval.value.workflowId;
          // Restore sections confirmed state
          for (const s of recordedApproval.value.sections) {
            sectionChecks.value[s.id] = s.confirmed;
          }
        }
      } catch { /* may have been withdrawn */ }
    }
  } catch (e) {
    console.error("Review load failed:", e);
  } finally {
    loading.value = false;
  }
});

watch(() => nav.value.approvalId, async (v) => {
  if (v && v !== recordedApproval.value?.id) {
    try { recordedApproval.value = await getApproval(v); } catch {}
  }
});

function parseSections(md: string) {
  const sections: { id: string; name: string }[] = [];
  const lines = md.split("\n");
  let currentH2: { id: string; name: string } | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      const name = m[1].trim();
      const id = "sec-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      currentH2 = { id, name };
      sections.push(currentH2);
      if (!(id in sectionChecks.value)) sectionChecks.value[id] = false;
    }
  }
  return sections;
}

const sectionsList = computed(() => parseSections(session.value?.specMarkdown ?? ""));
const allSectionsConfirmed = computed(() => sectionsList.value.length > 0 && sectionsList.value.every(s => sectionChecks.value[s.id]));
const chosenWorkflow = computed(() => workflows.value.find(w => w.id === selectedWorkflowId.value));
const needsQualityConfig = computed(() => QUALITY_WORKFLOWS.has(selectedWorkflowId.value));

function prefillSummary(s: DiscoverySessionState) {
  const wf = workflows.value.find(w => w.id === selectedWorkflowId.value);
  const stages = wf?.phases?.filter(p => p !== "request").join(" → ") || "plan";
  summary.value = {
    willHappen: `Run ${wf?.name ?? "the chosen workflow"} against your approved spec. Stages: ${stages}. The factory commits as it goes when the workflow supports it.`,
    willUse: `Your saved connections, including your router's auto model selection. A local router may forward requests to external providers. Your approved brief and chosen workflow.`,
    willNotDo: `Crew stops the process tree when reported usage reaches the token cap. Reporting can lag, so the cap is not an exact spending ceiling. It will not push to a remote.`,
    timeEstimate: `Depends on scope, models, checks, and repair rounds. Watch progress on the Run screen.`,
    costEstimate: `Depends on the providers selected by your router. A localhost address does not mean free inference. Check your router's pricing and limits.`,
    canUndo: `The factory's commits can be reverted with git. You can stop the run any time. The approval can be withdrawn before the run starts.`,
    cannotUndo: `If the builder edits a file outside git tracking, that change is on disk. (Protected files prevent this for factory code.) Once a run finishes, the commits are real.`,
  };
}

watch(selectedWorkflowId, () => {
  if (session.value && !recordedApproval.value) prefillSummary(session.value);
});

async function handleApprove() {
  if (!session.value || !chosenWorkflow.value) return;
  if (!allSectionsConfirmed.value) {
    alert("Please confirm every section first.");
    return;
  }
  if (!finalConfirm.value) {
    alert("Tick the box that says you've reviewed this and you're ready to run it.");
    return;
  }
  approving.value = true;
  try {
    const text = currentInputText();
    const record = await createApproval({
      specMarkdown: session.value.specMarkdown,
      specTitle: session.value.title,
      rawAttachment: text || undefined,
      rawAttachmentName: uploadedFileNameRef.value || undefined,
      approvedBy: "Lead Engineer",  // could be configurable; no typing required by user
      sections: sectionsList.value,
      summary: summary.value,
      workflowId: selectedWorkflowId.value,
      workflowName: chosenWorkflow.value.name,
      promptPreview: session.value.title,
    });
    recordedApproval.value = record;
    nav.value = { ...nav.value, approvalId: record.id };
  } catch (e: any) {
    alert("That didn't work: " + e.message);
  } finally {
    approving.value = false;
  }
}

function currentInputText(): string {
  // Pull the original input from the session if available; we don't store
  // a separate rawAttachment on the client, but the discovery session has
  // rawInput. Use that.
  return session.value?.rawInput ?? "";
}
// uploadedFileName ref lives in NewJobView; for the review screen we don't
// know the file name. Keep it empty for now; if a draft exists we can read
// it from localStorage here later.
const uploadedFileNameRef = ref<string>("");

async function handleWithdraw() {
  if (!recordedApproval.value) return;
  if (!confirm("Withdraw this approval? You will need to re-approve before the run can start.")) return;
  try {
    await withdrawApproval(recordedApproval.value.id);
    recordedApproval.value = null;
    finalConfirm.value = false;
  } catch (e: any) { alert(e.message); }
}

function continueToRun() {
  if (!recordedApproval.value) return;
  go("run", { approvalId: recordedApproval.value.id });
}

function backToNewJob() {
  go("new-job");
}

// Allow section toggle to update server-side record if we have one
async function toggleSection(sectionId: string) {
  sectionChecks.value[sectionId] = !sectionChecks.value[sectionId];
  if (recordedApproval.value) {
    try {
      const updated = await import("@/lib/api").then(m => m.setApprovalSection(
        recordedApproval.value!.id, sectionId, sectionChecks.value[sectionId],
      ));
      recordedApproval.value = updated;
    } catch {}
  }
}
</script>

<template>
  <div>
    <ScreenHeader screen="review-approve">
      <template #actions>
        <button class="btn btn-ghost btn-sm" @click="backToNewJob">
          <ArrowLeft :size="14" /> Back to New Job
        </button>
      </template>
    </ScreenHeader>

    <div v-if="loading" class="dim">Loading…</div>

    <template v-else-if="session">
      <!-- Breadcrumb -->
      <div class="breadcrumbs" aria-label="Breadcrumb">
        <button @click="backToNewJob">New Job</button>
        <span class="crumb-sep">›</span>
        <span class="crumb-current">Review &amp; Approve</span>
      </div>

      <!-- Already-approved banner -->
      <div v-if="recordedApproval" class="callout" :class="{ warn: recordedApproval.withdrawnAt }" style="margin-bottom: 14px;">
        <CheckCircle2 v-if="!recordedApproval.withdrawnAt" :size="16" style="vertical-align: middle; margin-right: 6px;" />
        <ShieldAlert v-else :size="16" style="vertical-align: middle; margin-right: 6px;" />
        <strong v-if="!recordedApproval.withdrawnAt">
          Approved v{{ recordedApproval.specVersion }} by {{ recordedApproval.approvedBy }} on {{ new Date(recordedApproval.approvedAt).toLocaleString() }}.
        </strong>
        <strong v-else>This approval was withdrawn.</strong>
        Workflow: {{ recordedApproval.workflowName }}
        <div style="margin-top: 8px; display: flex; gap: 8px;">
          <button v-if="!recordedApproval.withdrawnAt" class="btn btn-secondary btn-sm" @click="handleWithdraw">
            <Undo2 :size="14" /> Withdraw approval
          </button>
          <button v-if="!recordedApproval.withdrawnAt" class="btn btn-primary btn-sm" @click="continueToRun" data-tour="review-continue">
            Continue to Run <ArrowRight :size="14" />
          </button>
          <button v-else class="btn btn-primary btn-sm" @click="recordedApproval = null">
            Re-approve
          </button>
        </div>
      </div>

      <!-- Step 1: per-section confirmation -->
      <div class="section-card">
        <div class="section-label">Step 1 of 3 — confirm each section</div>
        <p class="dim" style="margin: 0 0 12px; font-size: 13px;">
          Each section of your spec is listed below. Tick the box to confirm you've read it. You can undo any check.
        </p>
        <div class="sections-list">
          <div v-for="s in sectionsList" :key="s.id" class="section-row" :class="{ confirmed: sectionChecks[s.id] }">
            <label class="check-label">
              <input type="checkbox" :checked="sectionChecks[s.id]" @change="toggleSection(s.id)" />
              <Check v-if="sectionChecks[s.id]" :size="14" />
              <span class="section-row-name">{{ s.name }}</span>
            </label>
            <span class="badge" :class="sectionChecks[s.id] ? 'badge-green' : ''">{{ sectionChecks[s.id] ? "confirmed" : "unconfirmed" }}</span>
          </div>
          <div v-if="sectionsList.length === 0" class="dim" style="font-size: 12.5px;">
            No sections detected in the spec (looking for "## Section" headings). Edit your spec in New Job first.
          </div>
        </div>
        <div class="quick-row">
          <button class="btn btn-ghost btn-xs" @click="sectionsList.forEach(s => sectionChecks[s.id] = true)">Confirm all</button>
          <button class="btn btn-ghost btn-xs" @click="sectionsList.forEach(s => sectionChecks[s.id] = false)">Clear all</button>
          <span class="dim" style="font-size: 12.5px;">{{ Object.values(sectionChecks).filter(Boolean).length }} / {{ sectionsList.length }} confirmed</span>
        </div>
      </div>

      <!-- Step 2: workflow choice + plain-language summary -->
      <div class="section-card" style="margin-top: 14px;">
        <div class="section-label">Step 2 of 3 — what will happen</div>

        <div class="sum-row">
          <div class="sum-label">Workflow</div>
          <div class="sum-value">
            <select v-model="selectedWorkflowId" :disabled="!!recordedApproval">
              <option v-for="w in workflows" :key="w.id" :value="w.id">{{ w.name }} <template v-if="w.badge">— {{ w.badge }}</template></option>
            </select>
            <div class="dim" style="font-size: 12px; margin-top: 4px;">{{ chosenWorkflow?.description }}</div>
            <div v-if="needsQualityConfig" class="sum-note">
              This workflow runs deterministic checks. Configure the real commands in Settings → Project checks first; Crew refuses to start without them.
            </div>
          </div>
        </div>

        <div class="sum-row">
          <div class="sum-label">What will happen</div>
          <textarea v-model="summary.willHappen" rows="2" :disabled="!!recordedApproval"></textarea>
        </div>
        <div class="sum-row">
          <div class="sum-label">What it will use</div>
          <textarea v-model="summary.willUse" rows="2" :disabled="!!recordedApproval"></textarea>
        </div>
        <div class="sum-row">
          <div class="sum-label">What it will not do</div>
          <textarea v-model="summary.willNotDo" rows="2" :disabled="!!recordedApproval"></textarea>
        </div>
        <div class="sum-grid">
          <div class="sum-row">
            <div class="sum-label">Rough time</div>
            <input type="text" v-model="summary.timeEstimate" :disabled="!!recordedApproval" />
          </div>
          <div class="sum-row">
            <div class="sum-label">Rough cost</div>
            <input type="text" v-model="summary.costEstimate" :disabled="!!recordedApproval" />
          </div>
        </div>
        <div class="sum-row">
          <div class="sum-label">What can be undone</div>
          <textarea v-model="summary.canUndo" rows="2" :disabled="!!recordedApproval"></textarea>
        </div>
        <div class="sum-row">
          <div class="sum-label">What cannot be undone</div>
          <textarea v-model="summary.cannotUndo" rows="2" :disabled="!!recordedApproval"></textarea>
        </div>
      </div>

      <!-- Step 3: final approval -->
      <div class="section-card" style="margin-top: 14px;">
        <div class="section-label">Step 3 of 3 — final approval</div>
        <div class="final-approval">
          <label class="final-check">
            <input type="checkbox" v-model="finalConfirm" :disabled="!allSectionsConfirmed || !!recordedApproval" />
            <span>I have reviewed this and I'm ready to run it. The record of who approved, when, and which version will be saved.</span>
          </label>
          <button
            class="btn btn-primary"
            :disabled="!allSectionsConfirmed || !finalConfirm || approving || !!recordedApproval"
            @click="handleApprove"
            data-tour="review-approve-btn"
          >
            <ShieldCheck :size="16" />
            {{ approving ? "Recording…" : "Approve and continue" }}
          </button>
        </div>
        <p class="dim" style="font-size: 12.5px; margin-top: 8px;">
          No typing required for approval. The checkbox is in words. A run can never start without a recorded approval — this is enforced by the server, not just this screen.
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sections-list { display: flex; flex-direction: column; gap: 6px; }
.section-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 12px; background: var(--panel); border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
}
.section-row.confirmed { border-color: color-mix(in srgb, var(--green) 30%, transparent); background: color-mix(in srgb, var(--green) 8%, transparent); }
.check-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13.5px; }
.section-row-name { font-weight: 500; }
.quick-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }

.sum-note { margin-top: 6px; padding: 6px 8px; font-size: 12px; color: var(--amber); background: color-mix(in srgb, var(--amber) 10%, transparent); border: 1px solid color-mix(in srgb, var(--amber) 28%, transparent); border-radius: var(--radius-sm); }
.sum-row { margin-bottom: 10px; }
.sum-label { font-size: 12.5px; font-weight: 600; color: var(--dim); margin-bottom: 4px; }
.sum-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sum-grid .sum-row { margin-bottom: 0; }

.final-approval { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
.final-check { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.5; cursor: pointer; flex: 1; min-width: 250px; }
.final-check input { margin-top: 3px; }

@media (max-width: 600px) { .sum-grid { grid-template-columns: 1fr; } }
</style>
