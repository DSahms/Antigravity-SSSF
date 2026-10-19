<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  ArrowRight, Clipboard, FileUp, FileText, HelpCircle, History,
  Lightbulb, MessageSquare, RotateCcw, Save, Send, Sparkles, Upload, X,
} from "lucide-vue-next";
import ScreenHeader from "@/components/ScreenHeader.vue";
import type {
  DiscoverySessionState, DiscoveryQuestionItem,
} from "@shared/types.ts";
import {
  analyzeDescription, answerQuestion, getDiscoverySession,
  rejectSuggestion, acceptSuggestion, resetDiscoverySession,
  sendChatMessage, updateSpecMarkdown,
  getProjectInfo,
} from "@/lib/api";
import { go } from "@/lib/nav";

const session = ref<DiscoverySessionState | null>(null);
const loading = ref(false);
const analyzing = ref(false);
const chatInput = ref("");
const listening = ref(false);
const VoiceRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let voice: any = null;
function toggleVoice() {
  if (listening.value) { voice?.stop(); return; }
  if (!VoiceRecognition) { alert("This browser doesn't support voice input. You can paste or upload your dictated text."); return; }
  voice = new VoiceRecognition();
  voice.lang = "en-US";
  voice.interimResults = false;
  voice.onresult = (event: any) => {
    const text = event.results[0][0].transcript;
    if (session.value?.rawInput) chatInput.value += `${chatInput.value ? " " : ""}${text}`;
    else { mode.value = "talk"; talkText.value += `${talkText.value ? " " : ""}${text}`; }
    saveDraft();
  };
  voice.onend = () => { listening.value = false; };
  voice.onerror = () => { listening.value = false; alert("Voice input couldn't start. Check microphone permission, or use Paste or Upload."); };
  listening.value = true;
  voice.start();
}
onUnmounted(() => { voice?.stop(); if (saveTimer) clearTimeout(saveTimer); saveDraft(); });

// 3 intake modes
const mode = ref<"talk" | "upload" | "paste">("talk");
const talkText = ref("");
const pasteText = ref("");
const uploadedFileName = ref<string>("");
const uploadedFileText = ref<string>("");
const uploadInput = ref<HTMLInputElement | null>(null);

// Examples
const EXAMPLES: string[] = [
  "Add a /health endpoint that returns JSON with the build SHA and current time. No new deps.",
  "Document the existing approval flow in docs/approvals.md. Read-only — no code changes.",
  "Find every place we read .env and list them in a report. Change nothing.",
  "Refactor the studio server's project switch to also reset the approval book.",
];

// Draft autosave (localStorage). Debounced 2s + on blur + on mode change.
let DRAFT_KEY = "";
const draftSavedAt = ref<string | null>(null);
let saveTimer: any = null;

function saveDraft() {
  if (!DRAFT_KEY) return;
  const payload = {
    mode: mode.value,
    talk: talkText.value,
    paste: pasteText.value,
    uploadedFileName: uploadedFileName.value,
    uploadedFileText: uploadedFileText.value,
    specMarkdown: session.value?.specMarkdown ?? "",
    savedAt: new Date().toISOString(),
  };
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(payload)); draftSavedAt.value = payload.savedAt; }
  catch { draftSavedAt.value = null; }
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 2000);
}
function loadDraft(): boolean {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    if (!d || (!d.talk && !d.paste && !d.uploadedFileText)) return false;
    mode.value = d.mode ?? "talk";
    talkText.value = d.talk ?? "";
    pasteText.value = d.paste ?? "";
    uploadedFileName.value = d.uploadedFileName ?? "";
    uploadedFileText.value = d.uploadedFileText ?? "";
    draftSavedAt.value = d.savedAt;
    return true;
  } catch { return false; }
}

onMounted(async () => {
  loading.value = true;
  try {
    const project = await getProjectInfo();
    DRAFT_KEY = `crew.draft.newjob:${project.path}`;
    if (!localStorage.getItem("crew.draft.legacyProject")) {
      const legacy = localStorage.getItem("crew.draft.newjob");
      if (legacy) localStorage.setItem(DRAFT_KEY, legacy);
      localStorage.setItem("crew.draft.legacyProject", project.path);
    }
    session.value = await getDiscoverySession();
    const hasDraft = loadDraft();
    if (hasDraft && !session.value.rawInput && !session.value.specMarkdown?.startsWith("# Specification: New Feature")) {
      // Resume draft into the session if the session is fresh
      if (session.value.specMarkdown && session.value.specMarkdown.length > 80) {
        // keep server session's spec
      }
    }
  } catch (e) {
    console.error("New Job load failed:", e);
  } finally {
    loading.value = false;
  }
});

// Watch for autosave on text changes
watch([talkText, pasteText, uploadedFileText, uploadedFileName, mode], () => {
  scheduleSave();
});

const currentInput = computed(() => {
  if (mode.value === "talk") return talkText.value;
  if (mode.value === "paste") return pasteText.value;
  if (mode.value === "upload") return uploadedFileText.value;
  return "";
});

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      alert("Clipboard is empty.");
      return;
    }
    pasteText.value = text;
    mode.value = "paste";
    saveDraft();
  } catch (e: any) {
    alert("Couldn't read the clipboard. That didn't work. Here's what to try: copy the text first, then click Paste again.");
  }
}

function handleUploadClick() {
  uploadInput.value?.click();
}

async function handleFileChosen(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  // .md or text only
  const okExt = /\.(md|markdown|txt|text)$/i.test(file.name);
  if (!okExt) {
    alert("Please choose a .md or .txt file.");
    input.value = "";
    return;
  }
  const text = await file.text();
  uploadedFileName.value = file.name;
  uploadedFileText.value = text;
  mode.value = "upload";
  saveDraft();
}

function clearUpload() {
  uploadedFileName.value = "";
  uploadedFileText.value = "";
  if (uploadInput.value) uploadInput.value.value = "";
}

function fillExample(text: string) {
  talkText.value = text;
  mode.value = "talk";
  saveDraft();
}

async function doAnalyze() {
  if (analyzing.value) return;
  const input = currentInput.value.trim();
  if (!input) {
    alert("Add some text first — talk it through, upload a file, or paste.");
    return;
  }
  analyzing.value = true;
  try {
    session.value = await analyzeDescription(input);
    saveDraft();
  } catch (e: any) {
    alert("That didn't work: " + e.message);
  } finally {
    analyzing.value = false;
  }
}

async function doChatSend() {
  if (!chatInput.value.trim() || analyzing.value) return;
  analyzing.value = true;
  try {
    session.value = await sendChatMessage(chatInput.value);
    chatInput.value = "";
  } catch (e: any) {
    alert("That didn't work: " + e.message);
  } finally { analyzing.value = false; }
}

async function doAnswerQuestion(q: DiscoveryQuestionItem, answer: string) {
  if (!session.value?.analysis) return;
  try {
    session.value = await answerQuestion(q.id, answer);
  } catch (e: any) {
    alert("That didn't work: " + e.message);
  }
}

async function doAcceptSuggestion(id: string) {
  if (!session.value) return;
  try { session.value = await acceptSuggestion(id); } catch (e: any) { alert(e.message); }
}
async function doRejectSuggestion(id: string) {
  if (!session.value) return;
  try { session.value = await rejectSuggestion(id); } catch (e: any) { alert(e.message); }
}

async function doResetSession() {
  if (!confirm("Reset the session? This clears the spec and the analysis. Drafts are kept.")) return;
  try {
    session.value = await resetDiscoverySession();
    talkText.value = "";
    pasteText.value = "";
    uploadedFileName.value = "";
    uploadedFileText.value = "";
  } catch (e: any) { alert(e.message); }
}

async function doEditSpec(md: string) {
  try { session.value = await updateSpecMarkdown(md); scheduleSave(); } catch (e: any) { alert(e.message); }
}

function continueToReview() {
  if (!session.value?.ready) { alert("Let's finish the interview first. Your interviewer will summarize the brief when it's ready."); return; }
  saveDraft();
  go("review-approve", { specPath: undefined });
}

const hasSpec = computed(() => Boolean(session.value?.ready));

const openQuestionsLeft = computed(() => session.value?.analysis?.openQuestions?.filter(q => !q.answered).length ?? 0);

const fmtTime = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
</script>

<template>
  <div>
    <ScreenHeader screen="new-job">
      <template #actions>
        <button class="btn btn-ghost btn-sm" @click="doResetSession" title="Reset session">
          <RotateCcw :size="14" /> Reset
        </button>
        <button class="btn btn-primary" :disabled="!hasSpec" @click="continueToReview" data-tour="new-job-continue">
          Continue
          <ArrowRight :size="14" />
        </button>
      </template>
    </ScreenHeader>
    <div class="section-card" style="margin-bottom: 14px">
      <button class="btn btn-secondary" :disabled="!VoiceRecognition" @click="toggleVoice">{{ listening ? "Stop listening" : "Use microphone" }}</button>
      <span class="dim"> {{ VoiceRecognition ? "Review your dictated words before sending. Your browser may use an external speech service." : "Voice input is unavailable in this browser; Paste and Upload remain available." }}</span>
    </div>

    <!-- Draft chip. Kept in the layout even when empty: inserting it on blur
         used to push the analyze button down between mousedown and mouseup,
         swallowing the first click. -->
    <div
      class="draft-chip"
      :class="{ empty: !draftSavedAt }"
      :aria-hidden="!draftSavedAt"
      aria-live="polite"
    >
      <Save :size="12" />
      <span v-if="draftSavedAt">Draft saved at {{ fmtTime(draftSavedAt) }}</span>
      <span v-else>Draft not saved yet</span>
    </div>

    <!-- 3 intake mode cards -->
    <div class="mode-grid" role="tablist" aria-label="Intake mode">
      <button class="mode-card" :class="{ active: mode === 'talk' }" @click="mode = 'talk'" data-tour="new-job-talk" role="tab">
        <MessageSquare :size="18" />
        <div class="mode-name">Talk it through</div>
        <div class="mode-desc">Describe what you want in plain words. No format required.</div>
      </button>
      <button class="mode-card" :class="{ active: mode === 'upload' }" @click="handleUploadClick" data-tour="new-job-upload" role="tab">
        <FileUp :size="18" />
        <div class="mode-name">Upload a file</div>
        <div class="mode-desc">Pick a <code>.md</code> or <code>.txt</code> file from your machine.</div>
      </button>
      <button class="mode-card" :class="{ active: mode === 'paste' }" @click="mode = 'paste'" data-tour="new-job-paste" role="tab">
        <Clipboard :size="18" />
        <div class="mode-name">Paste text</div>
        <div class="mode-desc">Use the Paste button to drop text straight from the clipboard.</div>
      </button>
    </div>
    <input ref="uploadInput" type="file" accept=".md,.markdown,.txt,.text" style="display:none" @change="handleFileChosen" />

    <!-- Active mode input -->
    <div class="section-card" style="margin-top: 14px;">
      <!-- TALK -->
      <div v-if="mode === 'talk'">
        <div class="section-label">Describe what you want</div>
        <textarea
          v-model="talkText"
          rows="6"
          placeholder="e.g. Add a /health endpoint that returns JSON with the build SHA and current time. No new dependencies."
          @blur="saveDraft"
        ></textarea>
      </div>

      <!-- UPLOAD -->
      <div v-else-if="mode === 'upload'">
        <div class="section-label">Upload a file</div>
        <div v-if="!uploadedFileName" class="upload-zone" @click="handleUploadClick">
          <Upload :size="22" />
          <div>Click to choose a <code>.md</code> or <code>.txt</code> file</div>
          <div class="dim" style="font-size: 12px;">The file stays on your machine. Only its text is read.</div>
        </div>
        <div v-else class="upload-done">
          <FileText :size="16" />
          <strong>{{ uploadedFileName }}</strong>
          <span class="dim">— {{ uploadedFileText.length.toLocaleString() }} chars</span>
          <button class="btn btn-ghost btn-xs" @click="clearUpload">Remove</button>
        </div>
      </div>

      <!-- PASTE -->
      <div v-else>
        <div class="section-label">Paste text</div>
        <div class="paste-row">
          <button class="btn btn-secondary" @click="pasteFromClipboard" data-tour="new-job-paste-btn">
            <Clipboard :size="14" /> Paste from clipboard
          </button>
          <span class="dim" style="font-size: 12px;">Trims leading/trailing whitespace automatically.</span>
        </div>
        <textarea
          v-model="pasteText"
          rows="6"
          placeholder="Or paste text here manually."
          @blur="saveDraft"
        ></textarea>
      </div>

      <!-- Examples -->
      <div v-if="mode !== 'upload'" class="examples-row">
        <div class="section-label" style="margin-bottom: 6px;">Or start from an example</div>
        <div class="example-chips">
          <button v-for="ex in EXAMPLES" :key="ex" class="example-chip" @click="fillExample(ex)">
            <Sparkles :size="11" /> {{ ex.length > 64 ? ex.slice(0, 64) + "…" : ex }}
          </button>
        </div>
      </div>

      <div style="margin-top: 12px;">
        <button class="btn btn-primary" :disabled="analyzing || !currentInput.trim()" @click="doAnalyze">
          <Sparkles :size="14" />
          {{ analyzing ? "Reading it through…" : "Read it back to me" }}
        </button>
      </div>
    </div>

    <!-- Read-back: parsed sections -->
    <div v-if="session?.analysis" class="section-card" style="margin-top: 14px;">
      <div class="section-label">Read-back — in clear sections</div>
      <p class="dim" style="margin: 0 0 10px; font-size: 13px;">{{ session.analysis.summary }}</p>

      <div class="readback-sections">
        <div class="rb-section">
          <div class="rb-name">Missing requirements ({{ session.analysis.missingRequirements.length }})</div>
          <ul>
            <li v-for="m in session.analysis.missingRequirements" :key="m.id">
              <strong>{{ m.title }}</strong> <span class="badge" :class="'badge-' + (m.severity === 'high' ? 'red' : m.severity === 'medium' ? 'amber' : 'blue')">{{ m.severity }}</span>
              <div class="dim" style="margin-top: 2px; font-size: 12.5px;">{{ m.detail }}</div>
            </li>
          </ul>
        </div>

        <div class="rb-section">
          <div class="rb-name">Ambiguities ({{ session.analysis.ambiguities.length }})</div>
          <ul>
            <li v-for="a in session.analysis.ambiguities" :key="a.id">
              <strong>{{ a.term }}</strong>
              <div class="dim" style="margin-top: 2px; font-size: 12.5px;">{{ a.explanation }}</div>
              <div v-if="a.suggestions" class="suggestion-chips">
                <span v-for="s in a.suggestions" :key="s" class="badge">{{ s }}</span>
              </div>
            </li>
          </ul>
        </div>

        <div class="rb-section">
          <div class="rb-name">Suggestions ({{ session.analysis.suggestions.length }})</div>
          <ul>
            <li v-for="s in session.analysis.suggestions" :key="s.id">
              <strong>{{ s.title }}</strong>
              <div class="dim" style="margin-top: 2px; font-size: 12.5px;">{{ s.description }}</div>
              <div class="suggestion-actions">
                <button v-if="s.status === 'pending'" class="btn btn-success btn-xs" @click="doAcceptSuggestion(s.id)">Accept</button>
                <button v-if="s.status === 'pending'" class="btn btn-ghost btn-xs" @click="doRejectSuggestion(s.id)">Reject</button>
                <span v-else class="badge" :class="s.status === 'accepted' ? 'badge-green' : 'badge-red'">{{ s.status }}</span>
              </div>
            </li>
          </ul>
        </div>

        <div class="rb-section">
          <div class="rb-name">Risks ({{ session.analysis.risks.length }})</div>
          <ul>
            <li v-for="r in session.analysis.risks" :key="r.id">
              <strong>{{ r.title }}</strong> <span class="badge" :class="'badge-' + (r.riskLevel === 'high' ? 'red' : r.riskLevel === 'medium' ? 'amber' : 'blue')">{{ r.riskLevel }}</span>
              <div class="dim" style="margin-top: 2px; font-size: 12.5px;">{{ r.mitigation }}</div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Open questions, one at a time -->
    <div v-if="session?.analysis?.openQuestions?.length" class="section-card" style="margin-top: 14px;">
      <div class="section-label">Open questions — asked one at a time</div>
      <div v-for="q in session.analysis.openQuestions" :key="q.id" class="q-card" :class="{ answered: q.answered }">
        <div class="q-question">{{ q.question }}</div>
        <div v-if="q.answered" class="q-answered">
          <span class="badge badge-green">answered</span> {{ q.answer }}
        </div>
        <div v-else class="q-choices">
          <button v-for="c in q.choices" :key="c" class="btn btn-secondary btn-xs" @click="doAnswerQuestion(q, c)">
            {{ c }}
          </button>
          <input
            type="text"
            placeholder="Or type your own answer (typing is optional)"
            @keyup.enter="doAnswerQuestion(q, ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>

    <!-- Editable spec -->
    <div v-if="session?.rawInput" class="section-card" style="margin-top: 14px;">
      <div class="section-label" style="display: flex; align-items: center; justify-content: space-between;">
        <span>Working spec — edit any section directly</span>
        <span class="dim" style="font-size: 11.5px; text-transform: none; font-weight: 400; letter-spacing: 0;">Auto-saves to draft. Editing after approval creates a new version.</span>
      </div>
      <textarea
        :value="session.specMarkdown"
        @input="doEditSpec(($event.target as HTMLTextAreaElement).value)"
        rows="14"
        class="spec-edit"
      ></textarea>
    </div>

    <!-- Bottom action -->
    <div class="bottom-action">
      <button class="btn btn-primary" :disabled="!hasSpec" @click="continueToReview">
        Continue to Review &amp; Approve
        <ArrowRight :size="14" />
      </button>
      <div class="dim" style="font-size: 12.5px;">
        <span v-if="openQuestionsLeft > 0">{{ openQuestionsLeft }} question(s) still open — you can answer them now or in review.</span>
        <span v-else-if="hasSpec">Spec looks ready. Continue to approve.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.draft-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; color: var(--dim);
  background: var(--panel-2); border: 1px solid var(--border-soft);
  padding: 2px 8px; border-radius: 10px;
  margin-bottom: 12px;
}
.draft-chip.empty { visibility: hidden; }
.mode-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
}
.mode-card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 14px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  cursor: pointer; color: var(--text); font-family: var(--sans); text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.mode-card:hover { border-color: var(--accent); background: var(--surface-hover); }
.mode-card.active { border-color: var(--accent); background: var(--accent-soft); }
.mode-name { font-weight: 600; font-size: 14px; margin-top: 2px; }
.mode-desc { font-size: 12.5px; color: var(--dim); line-height: 1.5; }

.upload-zone {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  padding: 28px; border: 2px dashed var(--border); border-radius: var(--radius);
  color: var(--dim); cursor: pointer; text-align: center;
}
.upload-zone:hover { border-color: var(--accent); color: var(--text); background: var(--panel-2); }
.upload-done { display: flex; align-items: center; gap: 8px; padding: 12px; background: var(--panel-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); }
.paste-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }

.examples-row { margin-top: 14px; }
.example-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.example-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; background: var(--panel-2); border: 1px solid var(--border-soft);
  border-radius: 14px; color: var(--dim); font-family: var(--sans); font-size: 12px;
  cursor: pointer; text-align: left; line-height: 1.4;
}
.example-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

.readback-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.rb-section { background: var(--panel); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 12px; }
.rb-name { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.rb-section ul { padding-left: 18px; margin: 0; }
.rb-section li { font-size: 13px; margin-bottom: 6px; }
.suggestion-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.suggestion-actions { display: flex; gap: 4px; margin-top: 6px; }

.q-card { padding: 12px; background: var(--panel); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); margin-bottom: 8px; }
.q-card.answered { opacity: 0.75; }
.q-question { font-weight: 600; font-size: 13.5px; margin-bottom: 8px; }
.q-choices { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.q-choices input { flex: 1; min-width: 200px; }
.q-answered { font-size: 13px; color: var(--dim); }

.spec-edit { font-family: var(--mono); font-size: 13px; line-height: 1.55; }

.bottom-action { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--border-soft); }

@media (max-width: 768px) {
  .mode-grid { grid-template-columns: 1fr; }
  .readback-sections { grid-template-columns: 1fr; }
}
</style>
