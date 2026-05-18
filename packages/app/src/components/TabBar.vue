<script setup lang="ts">
import type { SessionEntry } from "@tum/session";

defineProps<{
  sessions: readonly SessionEntry[];
  activeSessionId: string | null;
}>();

const emit = defineEmits<{
  (e: "switch", sessionId: string): void;
  (e: "close", sessionId: string): void;
  (e: "add"): void;
}>();

function tabLabel(s: SessionEntry): string {
  return s.name || s.id.slice(0, 8);
}
</script>

<template>
  <div
    class="flex items-stretch h-9 bg-surface border-b border-border select-none shrink-0 overflow-hidden"
  >
    <div class="flex flex-1 overflow-x-auto scrollbar-none">
      <button
        v-for="s in sessions"
        :key="s.id"
        :class="[
          'group relative flex items-center gap-1.5 px-3 h-full border-0 bg-transparent',
          'font-mono text-[13px] cursor-pointer whitespace-nowrap',
          'transition-colors shrink-0 max-w-[180px]',
          'text-text-muted hover:bg-surface-hover hover:text-text-hover',
          s.id === activeSessionId
            ? `bg-surface-hover text-text-active after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-accent after:content-['']`
            : '',
        ]"
        @click="emit('switch', s.id)"
      >
        <span class="overflow-hidden text-ellipsis">{{ tabLabel(s) }}</span>
        <span
          class="flex items-center justify-center w-4 h-4 rounded-sm text-[11px] leading-none opacity-0 transition group-hover:opacity-60 hover:opacity-100! hover:bg-border-hover hover:text-danger"
          :class="{ 'opacity-60': s.id === activeSessionId }"
          @click.stop="emit('close', s.id)"
          title="Close tab"
          >&#x2715;</span
        >
      </button>
    </div>

    <button
      class="px-3.5 text-base text-text-muted border-l border-border max-w-none hover:text-accent transition-colors shrink-0"
      @click="emit('add')"
      title="New tab"
    >
      +
    </button>
  </div>
</template>
