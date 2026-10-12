<script setup lang="ts">
import { computed } from "vue";
import { screenName, screenPurpose, stepNumber, type ScreenId } from "@/lib/nav";

const props = defineProps<{
  screen: ScreenId;
  /** Override the auto-computed purpose string. */
  purpose?: string;
  /** Hide the step badge (e.g. for Settings). */
  hideStep?: boolean;
}>();

const MAIN_FLOW_LENGTH = 4;

const step = computed(() => stepNumber(props.screen));
const name = computed(() => screenName(props.screen));
const purposeText = computed(() => props.purpose ?? screenPurpose(props.screen));
</script>

<template>
  <header class="screen-header">
    <div class="screen-title-block">
      <div class="screen-title">
        {{ name }}
        <span
          v-if="step && !hideStep"
          class="screen-step"
          :aria-label="`Step ${step} of ${MAIN_FLOW_LENGTH}`"
        >
          step {{ step }} of {{ MAIN_FLOW_LENGTH }}
        </span>
      </div>
      <p class="screen-purpose">{{ purposeText }}</p>
    </div>
    <div class="screen-actions">
      <slot name="actions" />
    </div>
  </header>
</template>
