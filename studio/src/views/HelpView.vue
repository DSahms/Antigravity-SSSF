<script setup lang="ts">
import {
  Compass, HelpCircle, LifeBuoy, ListChecks, PlayCircle, RotateCcw,
  Settings as SettingsIcon, Sparkles, Sliders,
} from "lucide-vue-next";
import ScreenHeader from "@/components/ScreenHeader.vue";
import { startTour, hasFinishedTour, hasFinishedFirstRun } from "@/lib/tour";
import { go } from "@/lib/nav";

const GLOSSARY: { term: string; def: string }[] = [
  { term: "Job", def: "A piece of work you want done. It starts as a description and ends as a result. CREW never runs a job without your approval." },
  { term: "Approval", def: "Your signed-off confirmation of the spec, the workflow, and the summary. Recorded with who/when/version. Withdrawable until the run starts." },
  { term: "Spec", def: "The markdown description of what you want. Sections are confirmed one at a time. Editing after approval makes a new version." },
  { term: "Workflow", def: "An ADW script in the factory (Plan, Build, Test, Review, Document...). Each workflow is a different chain." },
  { term: "Run", def: "A single execution of a workflow against an approved spec. Has a token cap. Can be paused or stopped." },
  { term: "Session", def: "The trace of a run: phases, agents, tool calls, gates, envelopes. Lives in the SQLite db." },
  { term: "Profile", def: "A saved model connection per role (base URL, model, key, reasoning level). Local is the default." },
  { term: "Local profile", def: "A connection to a service on this computer. It may be an LLM router that forwards requests to cloud models. Auto leaves model selection to that router." },
  { term: "Cloud profile", def: "Venice AI. Disabled until a VENICE_API_KEY is in .env. Never used in tests." },
  { term: "Token cap", def: "Crew stops when reported usage reaches this threshold. Reporting can lag; this is not an exact spending ceiling." },
];

const PHONE_TIPS: string[] = [
  "If someone is guiding you by phone, ask them to read the title at the top of the screen — every screen shows its plain name and step count.",
  "Every essential step is mouse-only. Buttons, dropdowns, file pickers, and Paste buttons. Typing is allowed but never required.",
  "Stopped working on something? Drafts auto-save. Look on the Home screen for 'Resume where you left off'.",
  "Want to undo an approval? You can withdraw it before the run starts. Any spec edit creates a new version that needs re-approval.",
];
</script>

<template>
  <div>
    <ScreenHeader screen="help" hide-step />
    <div class="section-card">
      <a class="btn btn-secondary" href="/manuals/users-manual/index.html" target="_blank" rel="noopener">User's Manual</a>
      <a class="btn btn-secondary" href="/manuals/learners-manual/index.html" target="_blank" rel="noopener">Learner's Manual</a>
    </div>

    <div class="help-cols">
      <div class="section-card">
        <div class="section-label">Tours</div>
        <button class="btn btn-secondary" style="width:100%; justify-content: flex-start; margin-bottom: 8px;" @click="startTour('main')">
          <RotateCcw :size="16" />
          Replay the main tour
        </button>
        <button class="btn btn-secondary" style="width:100%; justify-content: flex-start;" @click="startTour('firstrun')">
          <Sparkles :size="16" />
          Replay first-run setup
        </button>
        <p class="dim" style="font-size: 12.5px; margin-top: 10px;">
          You can restart the tour at any time from this button, or the Help button in the top bar.
        </p>
        <p class="dim" style="font-size: 12.5px;">
          Status: main tour {{ hasFinishedTour() ? "completed" : "not finished" }} · first-run {{ hasFinishedFirstRun() ? "completed" : "not finished" }}.
        </p>
      </div>

      <div class="section-card">
        <div class="section-label">If someone is guiding you by phone</div>
        <ul class="phone-tips">
          <li v-for="t in PHONE_TIPS" :key="t">{{ t }}</li>
        </ul>
      </div>
    </div>

    <div class="section-card" style="margin-top: 16px;">
      <div class="section-label">Glossary</div>
      <div class="glossary">
        <div v-for="g in GLOSSARY" :key="g.term" class="glossary-row">
          <div class="glossary-term">{{ g.term }}</div>
          <div class="glossary-def">{{ g.def }}</div>
        </div>
      </div>
    </div>

    <div class="section-card" style="margin-top: 16px;">
      <div class="section-label">Where things live</div>
      <div class="where-grid">
        <button class="where-card" @click="go('home')"><Compass :size="16" /> Home — start here</button>
        <button class="where-card" @click="go('new-job')"><Compass :size="16" /> New Job — describe what you want</button>
        <button class="where-card" @click="go('review-approve')"><ListChecks :size="16" /> Review &amp; Approve — the gate</button>
        <button class="where-card" @click="go('run')"><PlayCircle :size="16" /> Run — live console + token guard</button>
        <button class="where-card" @click="go('results')"><PlayCircle :size="16" /> Results — what changed</button>
        <button class="where-card" @click="go('sessions')"><Sliders :size="16" /> Sessions — full trace</button>
        <button class="where-card" @click="go('history')"><LifeBuoy :size="16" /> History — approval audit log</button>
        <button class="where-card" @click="go('settings')"><SettingsIcon :size="16" /> Settings — connection profiles</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.phone-tips { padding-left: 18px; margin: 0; }
.phone-tips li { margin-bottom: 8px; font-size: 13px; color: var(--dim); line-height: 1.5; }
.glossary { display: flex; flex-direction: column; gap: 8px; }
.glossary-row { display: grid; grid-template-columns: 140px 1fr; gap: 12px; padding: 8px 0; border-bottom: 1px dashed var(--border-soft); }
.glossary-row:last-child { border-bottom: none; }
.glossary-term { font-weight: 600; color: var(--text); font-size: 13.5px; }
.glossary-def { color: var(--dim); font-size: 13px; line-height: 1.55; }
.where-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.where-card {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: var(--panel); border: 1px solid var(--border-soft); border-radius: var(--radius-sm);
  cursor: pointer; color: var(--text); font-family: var(--sans); font-size: 13px; text-align: left;
}
.where-card:hover { border-color: var(--accent); color: var(--accent); }

@media (max-width: 768px) {
  .help-cols, .where-grid { grid-template-columns: 1fr; }
  .glossary-row { grid-template-columns: 1fr; gap: 2px; }
}
</style>
