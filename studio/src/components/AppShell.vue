<script setup lang="ts">
import {
  Compass, FolderGit2, FolderOpen, GitBranch, History, Home,
  LifeBuoy, ListChecks, PauseCircle, PlayCircle, Settings as SettingsIcon,
  Sliders, Wrench, X, Sun, Moon, HelpCircle,
} from "lucide-vue-next";
import { ref } from "vue";
import { nav, go, type ScreenId } from "@/lib/nav";
import { theme, toggleTheme } from "@/lib/theme";
import type { TargetProject } from "@shared/types.ts";

const props = defineProps<{
  project: TargetProject | null;
}>();

const emit = defineEmits<{
  (e: "switch-project"): void;
  (e: "stamp-factory"): void;
  (e: "open-help"): void;
}>();

const GROUPS: { label: string; items: { id: ScreenId; label: string; icon: any; tour?: string }[] }[] = [
  {
    label: "Workflow",
    items: [
      { id: "home", label: "Home", icon: Home, tour: "nav-home" },
      { id: "new-job", label: "New Job", icon: Compass, tour: "nav-new-job" },
      { id: "review-approve", label: "Review & Approve", icon: ListChecks, tour: "nav-review" },
      { id: "run", label: "Run", icon: PlayCircle, tour: "nav-run" },
      { id: "results", label: "Results", icon: PauseCircle, tour: "nav-results" },
    ],
  },
  {
    label: "Observe",
    items: [
      { id: "sessions", label: "Sessions", icon: Sliders, tour: "nav-sessions" },
      { id: "history", label: "History", icon: History, tour: "nav-history" },
    ],
  },
  {
    label: "Setup",
    items: [
      { id: "settings", label: "Settings", icon: SettingsIcon, tour: "nav-settings" },
      { id: "help", label: "Help", icon: LifeBuoy, tour: "nav-help" },
    ],
  },
];

function isActive(id: ScreenId): boolean {
  return nav.value.screen === id;
}
</script>

<template>
  <div class="app-shell">
    <!-- TOP BAR -->
    <header class="app-topbar">
      <div class="topbar-left">
        <div class="brand-group">
          <svg class="brand-logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="4" y="6" width="17" height="5" rx="2.5" fill="var(--accent)" />
            <rect x="8" y="13.5" width="20" height="5" rx="2.5" fill="var(--sage)" />
            <rect x="4" y="21" width="13" height="5" rx="2.5" fill="var(--amber)" />
          </svg>
          <div class="brand-text">
            <span class="brand-name">C.R.E.W.</span>
            <span class="brand-tag">Software</span>
          </div>
        </div>

        <button
          v-if="project"
          class="project-pill"
          @click="emit('switch-project')"
          title="Switch target repository"
        >
          <FolderGit2 :size="14" />
          <span class="pill-name">{{ project.name }}</span>
          <span v-if="project.gitBranch" class="badge">
            <GitBranch :size="11" />
            {{ project.gitBranch }}
          </span>
          <span
            class="badge"
            :class="project.isStamped ? 'badge-green' : 'badge-amber'"
          >
            {{ project.isStamped ? "Stamped" : "Not stamped" }}
          </span>
        </button>

        <button
          v-if="project && !project.isStamped"
          class="btn btn-primary btn-xs"
          @click="emit('stamp-factory')"
        >
          <Wrench :size="13" />
          Stamp factory here
        </button>
      </div>

      <div class="topbar-right">
        <button
          class="tour-help-btn"
          data-tour="help-btn"
          @click="emit('open-help')"
          title="Help — restart the tour"
        >
          <HelpCircle :size="14" />
          Help
        </button>
        <button
          class="tour-help-btn"
          @click="toggleTheme"
          :title="theme === 'dark' ? 'Switch to light' : 'Switch to dark'"
        >
          <Sun v-if="theme === 'dark'" :size="14" />
          <Moon v-else :size="14" />
          {{ theme === "dark" ? "Light" : "Dark" }}
        </button>
      </div>
    </header>

    <!-- SIDEBAR -->
    <aside class="app-sidebar">
      <nav v-for="group in GROUPS" :key="group.label" class="sidebar-group" :aria-label="group.label">
        <div class="sidebar-group-label">{{ group.label }}</div>
        <button
          v-for="item in group.items"
          :key="item.id"
          class="sidebar-item"
          :class="{ active: isActive(item.id) }"
          :data-tour="item.tour"
          @click="go(item.id)"
        >
          <component :is="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </aside>

    <!-- MAIN -->
    <main class="app-main">
      <slot />
    </main>
  </div>
</template>
