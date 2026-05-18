import type { KeyStroke, ResolvedBinding } from "./types";

export interface KeymapOptions {
  /**
   * Maximum time (ms) allowed between keystrokes in a prefix sequence
   * before the pending sequence is cancelled. Defaults to 1000.
   */
  sequenceTimeoutMs?: number;
}

/**
 * Minimal, zero-dependency keyboard shortcut engine.
 *
 * Supports:
 * - Simple single-key combos (Ctrl+T)
 * - Multi-key prefix sequences (Ctrl+B, then %) — like tmux
 * - Context-scoped bindings (same key does different things in different views)
 *
 * ## Usage
 *
 * ```ts
 * import { Keymap } from "@tum/keymap";
 * import type { KeyStroke } from "@tum/keymap";
 *
 * const km = new Keymap();
 *
 * km.register({
 *   id: "tab.new",
 *   keys: [{ key: "t", ctrlKey: true }],
 *   context: "app",
 *   handler: () => console.log("new tab"),
 * });
 *
 * // Feed DOM keydown events into it:
 * window.addEventListener("keydown", (e) => {
 *   const handled = km.handleKey(fromKeyboardEvent(e), "app");
 *   if (handled) e.preventDefault();
 * });
 * ```
 */
export class Keymap {
  private bindings = new Map<string, ResolvedBinding>();

  /** State machine for in-progress prefix sequences. */
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

  /** Throws if `id` is already registered. */
  register(binding: ResolvedBinding): void {
    if (this.bindings.has(binding.id)) {
      throw new Error(`Keybinding "${binding.id}" is already registered. Unregister it first.`);
    }
    this.bindings.set(binding.id, {
      ...binding,
      enabled: binding.enabled ?? true,
    });
  }

  /** Returns `false` if the id did not exist. */
  unregister(id: string): boolean {
    if (this.seq?.bindingId === id) this.clearSequence();
    return this.bindings.delete(id);
  }

  /**
   * Feed a keystroke into the engine.
   *
   * @param stroke  The pressed key + modifiers.
   * @param context Optional context tag to scope this stroke (e.g. "app", "terminal").
   * @returns `true` if a binding consumed the stroke (or advanced a sequence).
   */
  handleKey(stroke: KeyStroke, context?: string): boolean {
    // 1. If we are in the middle of a prefix sequence, only consider its next key.
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

    // 2. Search all bindings for a first-key match.
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

  /** No-op if the id does not exist. */
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

  /** Removes all registered bindings and clears pending state. */
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
