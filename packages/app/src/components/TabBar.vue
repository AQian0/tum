<script setup lang="ts">
import type { SessionTab } from "@tum/core";

const props = defineProps<{
  tabs: readonly SessionTab[];
  activeTabId: string | null;
}>();

const emit = defineEmits<{
  switch: [ptyId: string];
  close: [ptyId: string];
  add: [];
}>();

const baseTabClass = [
  "group relative flex items-center gap-1.5 px-3 h-full border-0 bg-transparent",
  "font-mono text-[13px] cursor-pointer whitespace-nowrap",
  "transition-colors shrink-0 max-w-[180px]",
  "text-text-muted hover:bg-surface-hover hover:text-text-hover",
] as const;

const activeTabClass =
  "bg-surface-hover text-text-active after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-accent after:content-['']";

const isActiveTab = (ptyId: string): boolean => ptyId === props.activeTabId;

const tabLabel = (tab: SessionTab): string => tab.name;
</script>

<template>
  <div
    class="flex items-stretch h-9 bg-surface border-b border-border select-none shrink-0 overflow-hidden"
  >
    <div class="flex flex-1 overflow-x-auto scrollbar-none">
      <button
        v-for="tab in tabs"
        :key="tab.ptyId"
        :class="[baseTabClass, isActiveTab(tab.ptyId) ? activeTabClass : '']"
        @click="emit('switch', tab.ptyId)"
      >
        <span class="overflow-hidden text-ellipsis">{{ tabLabel(tab) }}</span>
        <span
          class="flex items-center justify-center w-4 h-4 rounded-sm text-[11px] leading-none opacity-0 transition group-hover:opacity-60 hover:opacity-100 hover:text-danger"
          :class="{ 'opacity-60': isActiveTab(tab.ptyId) }"
          @click.stop="emit('close', tab.ptyId)"
          title="Close tab"
          >&#x2715;</span
        >
      </button>

      <button
        class="flex items-center justify-center w-8 h-full shrink-0 bg-transparent text-base text-text-muted hover:bg-surface-hover hover:text-accent transition-colors cursor-pointer border-0"
        @click="emit('add')"
        title="New tab"
      >
        +
      </button>
    </div>
  </div>
</template>
