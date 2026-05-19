import type { KeyStroke, ResolvedBinding } from "./types";

export interface KeymapOptions {
  sequenceTimeoutMs?: number;
}

export class Keymap {
  private bindings = new Map<string, ResolvedBinding>();
  private seq: {
    bindingId: string;
    matchedIndex: number;
    partialKeys: KeyStroke[];
  } | null = null;

  private seqTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly seqTimeoutMs: number;

  constructor(options?: KeymapOptions) {
    this.seqTimeoutMs = options?.sequenceTimeoutMs ?? 1000;
  }

  register(binding: ResolvedBinding): void {
    if (this.bindings.has(binding.id)) {
      throw new Error(`Keybinding "${binding.id}" is already registered. Unregister it first.`);
    }
    this.bindings.set(binding.id, {
      ...binding,
      enabled: binding.enabled ?? true,
    });
  }

  unregister(id: string): boolean {
    if (this.seq?.bindingId === id) this.clearSequence();
    return this.bindings.delete(id);
  }

  handleKey(stroke: KeyStroke, context?: string): boolean {
    if (this.seq) {
      const binding = this.bindings.get(this.seq.bindingId)!;
      const nextIdx = this.seq.matchedIndex + 1;
      const expected = binding.keys[nextIdx];

      if (this.strokesMatch(stroke, expected)) {
        if (nextIdx === binding.keys.length - 1) {
          this.clearSequence();
          this.fire(binding);
        } else {
          this.seq.matchedIndex = nextIdx;
          this.seq.partialKeys.push(stroke);
          this.resetSeqTimer();
        }
        return true;
      }

      this.clearSequence();
      return false;
    }

    for (const binding of this.bindings.values()) {
      if (binding.enabled === false) continue;
      if (binding.context !== undefined && binding.context !== context) continue;
      if (!this.strokesMatch(stroke, binding.keys[0])) continue;

      if (binding.keys.length === 1) {
        this.fire(binding);
        return true;
      }

      this.seq = {
        bindingId: binding.id,
        matchedIndex: 0,
        partialKeys: [stroke],
      };
      this.resetSeqTimer();
      return true;
    }

    return false;
  }

  setEnabled(id: string, enabled: boolean): void {
    const b = this.bindings.get(id);
    if (b) b.enabled = enabled;
  }

  getBindings(): ResolvedBinding[] {
    return Array.from(this.bindings.values());
  }

  isPendingSequence(): boolean {
    return this.seq !== null;
  }

  cancelSequence(): void {
    this.clearSequence();
  }

  clear(): void {
    this.bindings.clear();
    this.clearSequence();
  }

  private strokesMatch(actual: KeyStroke, expected: KeyStroke): boolean {
    if (actual.key.toLowerCase() !== expected.key.toLowerCase()) return false;
    if (!!actual.ctrlKey !== !!expected.ctrlKey) return false;
    if (!!actual.metaKey !== !!expected.metaKey) return false;
    if (!!actual.altKey !== !!expected.altKey) return false;
    if (!!actual.shiftKey !== !!expected.shiftKey) return false;
    return true;
  }

  private fire(binding: ResolvedBinding): void {
    try {
      binding.handler();
    } catch (e) {
      console.error(`Error executing keybinding "${binding.id}":`, e);
    }
  }

  private resetSeqTimer(): void {
    if (this.seqTimer) clearTimeout(this.seqTimer);
    this.seqTimer = setTimeout(() => this.clearSequence(), this.seqTimeoutMs);
  }

  private clearSequence(): void {
    this.seq = null;
    if (this.seqTimer) {
      clearTimeout(this.seqTimer);
      this.seqTimer = null;
    }
  }
}
