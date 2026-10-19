<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck,
  FileDown,
  FileText,
  HelpCircle,
  Lightbulb,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Upload,
  X,
} from "lucide-vue-next";
import type {
  ApprovalRecord,
  DiscoveryAmbiguityItem,
  DiscoveryAnalysis,
  DiscoveryAnalysisItem,
  DiscoveryChatMessage,
  DiscoveryQuestionItem,
  DiscoverySessionState,
  DiscoverySuggestionItem,
} from "@shared/types.ts";
import {
  acceptSuggestion,
  analyzeDescription,
  answerQuestion,
  approveSpecification,
  getDiscoverySession,
  rejectSuggestion,
  resetDiscoverySession,
  sendChatMessage,
  updateSpecMarkdown,
} from "@/lib/api";

const emit = defineEmits<{
  (e: "launch-spec", specPath: string): void;
}>();

const session = ref<DiscoverySessionState | null>(null);
const loading = ref(false);
const chatInput = ref("");
const roughInput = ref("");
const activeLeftTab = ref<"review" | "chat">("review");
const rightMode = ref<"edit" | "preview">("edit");

// Approval modal
const showApproveModal = ref(false);
const approveFileName = ref("approved-spec.md");
const approveAuthor = ref("Lead Engineer");
const approveSuccessRecord = ref<ApprovalRecord | null>(null);
const approving = ref(false);

onMounted(async () => {
  await loadSession();
});

async function loadSession() {
  try {
    loading.value = true;
    session.value = await getDiscoverySession();
    if (session.value.rawInput && !roughInput.value) {
      roughInput.value = session.value.rawInput;
    }
  } catch (err) {
    console.error("Failed to load discovery session:", err);
  } finally {
    loading.value = false;
  }
}

async function handleAnalyze() {
  if (!roughInput.value.trim()) return;
  try {
    loading.value = true;
    session.value = await analyzeDescription(roughInput.value);
    activeLeftTab.value = "review";
  } catch (err: any) {
    alert("Analysis failed: " + err.message);
  } finally {
    loading.value = false;
  }
}

async function handleSendMessage() {
  if (!chatInput.value.trim() || loading.value) return;
  const msg = chatInput.value.trim();
  chatInput.value = "";
  try {
    loading.value = true;
    session.value = await sendChatMessage(msg);
  } catch (err: any) {
    alert("Failed to send message: " + err.message);
  } finally {
    loading.value = false;
  }
}

async function handleAcceptSuggestion(sug: DiscoverySuggestionItem) {
  try {
    loading.value = true;
    session.value = await acceptSuggestion(sug.id);
  } catch (err: any) {
    alert("Error accepting suggestion: " + err.message);
  } finally {
    loading.value = false;
  }
}

async function handleRejectSuggestion(sug: DiscoverySuggestionItem) {
  try {
    session.value = await rejectSuggestion(sug.id);
  } catch (err: any) {
    alert("Error rejecting suggestion: " + err.message);
  }
}

async function handleAnswerQuestion(q: DiscoveryQuestionItem, choiceText?: string) {
  const ans = choiceText || q.answer;
  if (!ans || !ans.trim()) return;
  try {
    loading.value = true;
    session.value = await answerQuestion(q.id, ans);
  } catch (err: any) {
    alert("Error answering question: " + err.message);
  } finally {
    loading.value = false;
  }
}

async function handleSpecBlur() {
  if (!session.value) return;
  try {
    await updateSpecMarkdown(session.value.specMarkdown);
  } catch (e) {
    console.error("Failed to auto-save markdown:", e);
  }
}

async function handleReset() {
  if (confirm("Reset current discovery session and start a new intake?")) {
    roughInput.value = "";
    session.value = await resetDiscoverySession();
  }
}

function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    roughInput.value = (e.target?.result as string) || "";
    handleAnalyze();
  };
  reader.readAsText(file);
}

function loadTemplate(type: string) {
  if (type === "api") {
    roughInput.value = `# Fast HTTP API Endpoint
Add a robust /api/v1/metrics endpoint that aggregates memory, CPU, active session count, and worker status.
Requires structured JSON error envelopes, sub-50ms latency, and deterministic unit tests.`;
  } else if (type === "auth") {
    roughInput.value = `# Authentication & Role-Based Access Control
Implement secure JWT authentication with refresh token rotation and role-based permissions (admin, engineer, viewer).
Must store hashed credentials in SQLite and pass quality build gates.`;
  } else if (type === "refactor") {
    roughInput.value = `# Modular Architecture Refactoring
Extract data persistence layer into an isolated repository module with explicit transaction boundaries.
Leave existing core ADW scripts intact and ensure all test suites pass.`;
  }
  handleAnalyze();
}

async function confirmApprove() {
  if (!session.value) return;
  try {
    approving.value = true;
    const res = await approveSpecification(approveFileName.value, approveAuthor.value);
    approveSuccessRecord.value = res;
    // reload session to reflect updated assistant message
    await loadSession();
  } catch (err: any) {
    alert("Approval failed: " + err.message);
  } finally {
    approving.value = false;
  }
}

function closeApproveModal() {
  showApproveModal.value = false;
  approveSuccessRecord.value = null;
}

function jumpToLaunch(filePath: string) {
  closeApproveModal();
  emit("launch-spec", filePath);
}

const wordCount = computed(() => {
  return session.value?.specMarkdown
    ? session.value.specMarkdown.split(/\s+/).filter(Boolean).length
    : 0;
});
</script>

<template>
  <div class="discovery-container">
    <!-- Top toolbar banner -->
    <div class="discovery-header">
      <div class="header-left">
        <div class="title-row">
          <Compass class="w-5 h-5 text-indigo-400" />
          <h2 class="text-xl font-bold tracking-wide">Interactive Discovery & Intake</h2>
          <span class="badge badge-purple" v-if="session?.analysis">Architectural Review Active</span>
        </div>
        <p class="text-xs text-zinc-400">
          Refine rough requirements with the Discovery agent → approve specification → save to target repo for factory execution.
        </p>
      </div>

      <div class="header-right">
        <button class="btn btn-secondary text-xs" @click="handleReset" title="Start new intake">
          <RefreshCw class="w-3.5 h-3.5" />
          New Intake
        </button>

        <button
          class="btn btn-primary text-xs"
          @click="showApproveModal = true"
          :disabled="!session?.specMarkdown"
        >
          <FileCheck class="w-4 h-4 text-emerald-300" />
          Approve Specification
        </button>
      </div>
    </div>

    <!-- Main Workspace Split Pane -->
    <div class="workspace-grid">
      <!-- LEFT PANE: Intake, Review, Questions, Chat -->
      <div class="left-pane">
        <!-- Intake Card (if no analysis or expanding) -->
        <div class="intake-card" v-if="!session?.analysis">
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <Sparkles class="w-4 h-4 text-indigo-400" />
              Describe what you want to build
            </label>
            <div class="flex items-center gap-2">
              <label class="btn btn-secondary text-xs cursor-pointer">
                <Upload class="w-3.5 h-3.5 text-zinc-400" />
                Upload .md
                <input type="file" accept=".md,.txt" class="hidden" @change="handleFileUpload" />
              </label>
            </div>
          </div>

          <textarea
            v-model="roughInput"
            class="rough-textarea"
            placeholder="Paste rough idea, user story, or API requirements here... (e.g. 'Build an authentication service with JWT and SQLite')"
            rows="6"
          ></textarea>

          <div class="mt-3 flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs text-zinc-400">
              <span class="text-zinc-500">Quick templates:</span>
              <button class="template-chip" @click="loadTemplate('api')">REST API</button>
              <button class="template-chip" @click="loadTemplate('auth')">Auth / RBAC</button>
              <button class="template-chip" @click="loadTemplate('refactor')">Refactor</button>
            </div>

            <button
              class="btn btn-primary"
              :disabled="!roughInput.trim() || loading"
              @click="handleAnalyze"
            >
              <Sparkles class="w-4 h-4" />
              {{ loading ? "Analyzing..." : "Review & Synthesize" }}
            </button>
          </div>
        </div>

        <!-- Review Results + Chat Navigation Tabs -->
        <div class="review-box" v-else>
          <div class="tab-strip">
            <button
              class="tab-btn"
              :class="{ active: activeLeftTab === 'review' }"
              @click="activeLeftTab = 'review'"
            >
              <Lightbulb class="w-4 h-4 text-amber-400" />
              Architectural Review
              <span class="pill-count" v-if="session.analysis">
                {{
                  (session.analysis.missingRequirements.length || 0) +
                  (session.analysis.openQuestions.length || 0)
                }}
              </span>
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeLeftTab === 'chat' }"
              @click="activeLeftTab = 'chat'"
            >
              <MessageSquare class="w-4 h-4 text-cyan-400" />
              Discovery Chat
              <span class="pill-count" v-if="session.chatHistory.length > 1">
                {{ session.chatHistory.length }}
              </span>
            </button>
          </div>

          <!-- Review Content -->
          <div class="tab-content" v-if="activeLeftTab === 'review' && session.analysis">
            <!-- 1. MISSING REQUIREMENTS -->
            <div class="section-card">
              <div class="section-header">
                <AlertTriangle class="w-4 h-4 text-amber-400" />
                <span class="section-title">Missing Requirements & Edge Cases</span>
                <span class="badge badge-amber">{{ session.analysis.missingRequirements.length }}</span>
              </div>
              <div class="card-list">
                <div
                  v-for="item in session.analysis.missingRequirements"
                  :key="item.id"
                  class="review-item border-amber-900/30"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-sm text-amber-200">{{ item.title }}</span>
                    <span class="badge badge-amber text-xs uppercase">{{ item.severity }}</span>
                  </div>
                  <p class="text-xs text-zinc-300 mt-1 leading-relaxed">{{ item.detail }}</p>
                </div>
              </div>
            </div>

            <!-- 2. AMBIGUITIES -->
            <div class="section-card" v-if="session.analysis.ambiguities.length">
              <div class="section-header">
                <HelpCircle class="w-4 h-4 text-blue-400" />
                <span class="section-title">Ambiguities & Unstated Assumptions</span>
                <span class="badge badge-blue">{{ session.analysis.ambiguities.length }}</span>
              </div>
              <div class="card-list">
                <div
                  v-for="item in session.analysis.ambiguities"
                  :key="item.id"
                  class="review-item border-blue-900/30"
                >
                  <span class="font-bold text-sm text-blue-200">Term: "{{ item.term }}"</span>
                  <p class="text-xs text-zinc-300 mt-1">{{ item.explanation }}</p>
                  <div class="flex flex-wrap gap-1.5 mt-2" v-if="item.suggestions">
                    <span
                      v-for="sug in item.suggestions"
                      :key="sug"
                      class="badge text-zinc-300 border-zinc-700 cursor-pointer hover:border-blue-500"
                      @click="chatInput = `Clarification on ${item.term}: ${sug}`; handleSendMessage();"
                    >
                      + Adopt "{{ sug }}"
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. CONCRETE SUGGESTIONS -->
            <div class="section-card" v-if="session.analysis.suggestions.length">
              <div class="section-header">
                <Lightbulb class="w-4 h-4 text-emerald-400" />
                <span class="section-title">Concrete Architectural Suggestions</span>
                <span class="badge badge-green">{{ session.analysis.suggestions.length }}</span>
              </div>
              <div class="card-list">
                <div
                  v-for="sug in session.analysis.suggestions"
                  :key="sug.id"
                  class="review-item border-emerald-900/30"
                  :class="{ 'opacity-60 bg-emerald-950/20': sug.status === 'accepted', 'opacity-40': sug.status === 'rejected' }"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-sm text-emerald-200">{{ sug.title }}</span>
                        <span
                          class="badge text-xs"
                          :class="sug.status === 'accepted' ? 'badge-green' : sug.status === 'rejected' ? 'badge-red' : 'badge-blue'"
                        >
                          {{ sug.status }}
                        </span>
                      </div>
                      <p class="text-xs text-zinc-300 mt-1">{{ sug.description }}</p>
                    </div>

                    <div class="flex items-center gap-1 shrink-0" v-if="sug.status === 'pending'">
                      <button
                        class="btn btn-success text-xs py-1 px-2.5"
                        @click="handleAcceptSuggestion(sug)"
                        title="Incorporate into specification"
                      >
                        <Check class="w-3.5 h-3.5" />
                        Accept
                      </button>
                      <button
                        class="btn btn-secondary text-xs py-1 px-2 text-zinc-400 hover:text-red-400"
                        @click="handleRejectSuggestion(sug)"
                        title="Dismiss suggestion"
                      >
                        <X class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 4. OPEN QUESTIONS -->
            <div class="section-card" v-if="session.analysis.openQuestions.length">
              <div class="section-header">
                <HelpCircle class="w-4 h-4 text-purple-400" />
                <span class="section-title">Open Questions for Engineer</span>
                <span class="badge badge-purple">{{ session.analysis.openQuestions.length }}</span>
              </div>
              <div class="card-list">
                <div
                  v-for="q in session.analysis.openQuestions"
                  :key="q.id"
                  class="review-item border-purple-900/30"
                  :class="{ 'opacity-80 bg-purple-950/20': q.answered }"
                >
                  <span class="font-bold text-sm text-purple-200">{{ q.question }}</span>
                  
                  <div class="mt-2.5 flex flex-wrap gap-2" v-if="q.choices && !q.answered">
                    <button
                      v-for="choice in q.choices"
                      :key="choice"
                      class="choice-btn"
                      @click="handleAnswerQuestion(q, choice)"
                    >
                      {{ choice }}
                    </button>
                  </div>

                  <div class="mt-2 flex items-center gap-2" v-if="!q.answered">
                    <input
                      v-model="q.answer"
                      class="text-input text-xs"
                      placeholder="Or type custom answer..."
                      @keyup.enter="handleAnswerQuestion(q)"
                    />
                    <button
                      class="btn btn-secondary text-xs py-1 px-3"
                      :disabled="!q.answer"
                      @click="handleAnswerQuestion(q)"
                    >
                      Answer
                    </button>
                  </div>

                  <div class="mt-1 text-xs text-emerald-400 flex items-center gap-1.5" v-if="q.answered">
                    <CheckCircle2 class="w-3.5 h-3.5" />
                    <span>Decision: <strong>{{ q.answer }}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 5. RISKS -->
            <div class="section-card" v-if="session.analysis.risks.length">
              <div class="section-header">
                <ShieldAlert class="w-4 h-4 text-red-400" />
                <span class="section-title">Risks & Mitigations</span>
                <span class="badge badge-red">{{ session.analysis.risks.length }}</span>
              </div>
              <div class="card-list">
                <div
                  v-for="r in session.analysis.risks"
                  :key="r.id"
                  class="review-item border-red-900/30"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-sm text-red-200">{{ r.title }}</span>
                    <span class="badge badge-red text-xs uppercase">{{ r.riskLevel }} risk</span>
                  </div>
                  <p class="text-xs text-zinc-300 mt-1">
                    <strong class="text-zinc-400">Mitigation:</strong> {{ r.mitigation }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Chat Conversation View -->
          <div class="tab-content chat-view" v-if="activeLeftTab === 'chat'">
            <div class="chat-messages">
              <div
                v-for="msg in session.chatHistory"
                :key="msg.id"
                class="chat-bubble-row"
                :class="msg.role === 'user' ? 'user-row' : 'agent-row'"
              >
                <div class="chat-avatar">
                  <span v-if="msg.role === 'user'">👤</span>
                  <span v-else>🤖</span>
                </div>
                <div class="chat-bubble">
                  <div class="chat-header">
                    <span class="chat-sender font-bold text-xs">
                      {{ msg.role === 'user' ? 'Engineer' : 'Discovery Agent' }}
                    </span>
                    <span class="chat-time text-xs text-zinc-500">
                      {{ new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                    </span>
                  </div>
                  <div class="chat-body text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                    {{ msg.content }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Chat input bar -->
            <div class="chat-input-row">
              <input
                v-model="chatInput"
                class="chat-input"
                placeholder="Ask Discovery agent a question or clarify scope..."
                @keyup.enter="handleSendMessage"
              />
              <button class="btn btn-primary" :disabled="!chatInput.trim() || loading" @click="handleSendMessage">
                <Send class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT PANE: Live Specification Document Editor -->
      <div class="right-pane">
        <div class="doc-header">
          <div class="flex items-center gap-2">
            <FileText class="w-4 h-4 text-indigo-400" />
            <span class="font-bold text-sm text-zinc-200">Approved Specification Draft</span>
            <span class="badge text-xs">{{ wordCount }} words</span>
          </div>

          <div class="flex items-center gap-2">
            <div class="mode-toggle">
              <button
                class="mode-btn"
                :class="{ active: rightMode === 'edit' }"
                @click="rightMode = 'edit'"
              >
                Markdown Editor
              </button>
              <button
                class="mode-btn"
                :class="{ active: rightMode === 'preview' }"
                @click="rightMode = 'preview'"
              >
                Preview
              </button>
            </div>
          </div>
        </div>

        <div class="doc-editor-container" v-if="session">
          <textarea
            v-if="rightMode === 'edit'"
            v-model="session.specMarkdown"
            class="spec-editor"
            placeholder="# Specification Markdown will generate here..."
            @blur="handleSpecBlur"
          ></textarea>

          <div v-else class="spec-preview">
            <pre class="preview-pre">{{ session.specMarkdown }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- APPROVE SPECIFICATION MODAL -->
    <div class="modal-overlay" v-if="showApproveModal">
      <div class="modal-card">
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <FileCheck class="w-5 h-5 text-emerald-400" />
            <h3 class="text-base font-bold text-white">Approve Specification</h3>
          </div>
          <button class="text-zinc-400 hover:text-white" @click="closeApproveModal">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Success view -->
        <div v-if="approveSuccessRecord" class="p-6 text-center">
          <div class="w-12 h-12 bg-emerald-950/60 border border-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-400">
            <Check class="w-6 h-6" />
          </div>
          <h4 class="text-lg font-bold text-emerald-300">Specification Approved & Saved!</h4>
          <p class="text-xs text-zinc-300 mt-2">
            Written to: <code class="bg-zinc-900 px-2 py-0.5 rounded text-emerald-400">{{ approveSuccessRecord.savedFilePath }}</code>
          </p>
          <p class="text-xs text-zinc-400 mt-1">
            Word count: {{ approveSuccessRecord.wordCount }} words · Approved by {{ approveSuccessRecord.approvedBy }}
          </p>

          <div class="mt-6 flex justify-center gap-3">
            <button class="btn btn-secondary text-xs" @click="closeApproveModal">
              Close
            </button>
            <button class="btn btn-primary text-xs" @click="jumpToLaunch(approveSuccessRecord.savedFilePath)">
              Launch Factory ADW Now
              <ArrowRight class="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>

        <!-- Approval form -->
        <div v-else class="p-6 space-y-4">
          <p class="text-xs text-zinc-300">
            Approving this specification writes it into the target repository's <code class="text-indigo-300">requests/</code> directory and stamps the audit trail. The factory will consume this exact file as its prompt.
          </p>

          <div class="space-y-1.5">
            <label class="text-xs font-bold text-zinc-300">Target File Name</label>
            <div class="flex items-center gap-2">
              <span class="text-xs text-zinc-500 font-mono">requests/</span>
              <input
                v-model="approveFileName"
                class="text-input text-xs font-mono"
                placeholder="approved-spec.md"
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-bold text-zinc-300">Approving Engineer</label>
            <input
              v-model="approveAuthor"
              class="text-input text-xs"
              placeholder="Your name or handle"
            />
          </div>

          <div class="bg-zinc-900/70 border border-zinc-800 rounded p-3 text-xs space-y-1.5">
            <div class="font-bold text-zinc-300 flex items-center gap-1.5">
              <CheckCircle2 class="w-4 h-4 text-emerald-400" />
              Crew Readiness Check
            </div>
            <div class="text-zinc-400">✓ Specification title & overview defined</div>
            <div class="text-zinc-400">✓ Architectural boundaries and protected files specified</div>
            <div class="text-zinc-400">✓ Quality verification and test expectations explicit</div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button class="btn btn-secondary text-xs" @click="closeApproveModal">
              Cancel
            </button>
            <button
              class="btn btn-primary text-xs"
              :disabled="approving || !approveFileName.trim()"
              @click="confirmApprove"
            >
              <FileCheck class="w-4 h-4 text-emerald-300" />
              {{ approving ? "Writing to repo..." : "Sign & Approve" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.discovery-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: calc(100vh - 120px);
}

.discovery-header {
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

.workspace-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.left-pane, .right-pane {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.intake-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.rough-textarea {
  width: 100%;
  flex: 1;
  background: var(--panel-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  padding: 12px;
  resize: none;
  outline: none;
}
.rough-textarea:focus {
  border-color: var(--indigo);
}

.template-chip {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--blue);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.template-chip:hover {
  border-color: var(--blue);
}

.review-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tab-strip {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--panel-3);
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

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-card {
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--dim);
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-item {
  background: var(--panel-3);
  border: 1px solid;
  border-radius: 6px;
  padding: 10px 12px;
}

.choice-btn {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.choice-btn:hover {
  border-color: var(--purple);
  background: rgba(200, 155, 255, 0.1);
}

.text-input {
  flex: 1;
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

/* Chat view */
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 6px;
}

.chat-bubble-row {
  display: flex;
  gap: 10px;
}
.chat-bubble-row.user-row {
  flex-direction: row-reverse;
}

.chat-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.user-row .chat-bubble {
  background: #1e1b4b;
  border-color: #3730a3;
}
.agent-row .chat-bubble {
  background: var(--panel);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.chat-input-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.chat-input {
  flex: 1;
  background: var(--panel-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 8px 12px;
  font-size: 13px;
  outline: none;
}

/* Right pane */
.doc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--panel-3);
}

.mode-toggle {
  display: flex;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.mode-btn {
  background: transparent;
  border: none;
  color: var(--dim);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.mode-btn.active {
  background: var(--indigo);
  color: #fff;
}

.doc-editor-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.spec-editor {
  flex: 1;
  width: 100%;
  background: var(--panel-3);
  border: none;
  color: #e2e8f0;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.6;
  padding: 16px;
  resize: none;
  outline: none;
}

.spec-preview {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.preview-pre {
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--sans);
  font-size: 14px;
  white-space: pre-wrap;
  color: var(--text);
}

/* Modal */
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
  max-width: 520px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  overflow: hidden;
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
