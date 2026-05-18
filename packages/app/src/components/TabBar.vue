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
  <div class="tab-bar">
    <div class="tabs">
      <button
        v-for="s in sessions"
        :key="s.id"
        :class="['tab', { active: s.id === activeSessionId }]"
        @click="emit('switch', s.id)"
      >
        <span class="tab-label">{{ tabLabel(s) }}</span>
        <span
          class="tab-close"
          @click.stop="emit('close', s.id)"
          title="Close tab"
        >&#x2715;</span>
      </button>
    </div>

    <button
      class="tab tab-add"
      @click="emit('add')"
      title="New tab"
    >+</button>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 36px;
  background: #12131a;
  border-bottom: 1px solid #1e1f2a;
  user-select: none;
  -webkit-user-select: none;
  flex-shrink: 0;
  overflow: hidden;
}

.tabs {
  display: flex;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 100%;
  border: none;
  background: transparent;
  color: #6b6375;
  font-family: "JetBrains Mono", "Fira Code", ui-monospace, Consolas, monospace;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  position: relative;
  transition: color 0.15s, background 0.15s;
  flex-shrink: 0;
  max-width: 180px;
}

.tab:hover {
  background: #1a1b26;
  color: #c8c8d0;
}

.tab.active {
  background: #1a1b26;
  color: #e0e0e8;
}

.tab.active::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #c084fc;
}

.tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  font-size: 11px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}

.tab:hover .tab-close,
.tab.active .tab-close {
  opacity: 0.6;
}

.tab-close:hover {
  opacity: 1 !important;
  background: #2a2b3a;
  color: #f7768e;
}

.tab-add {
  padding: 0 14px;
  font-size: 16px;
  color: #6b6375;
  border-left: 1px solid #1e1f2a;
  max-width: none;
}

.tab-add:hover {
  color: #c084fc;
}
</style>
