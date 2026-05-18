/** Represents a single key press, mirroring the relevant fields of KeyboardEvent. */
export interface KeyStroke {
  /** KeyboardEvent.key value, normalized to lowercase for matching. */
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/** A named keybinding definition (without the handler). */
export interface KeyBinding {
  /** Unique identifier, e.g. "tab.new" or "pane.splitLeft". */
  id: string;
  /** Human-readable description shown in UI. */
  description?: string;
  /**
   * Sequence of keystrokes.
   * Single element = simple shortcut (Ctrl+T).
   * Multiple elements = prefix sequence (Ctrl+B then %).
   */
  keys: KeyStroke[];
  /**
   * Optional context tag. The binding only fires when this context matches
   * the one passed to `handleKey()`, allowing the same keystroke to do
   * different things in different parts of the app.
   */
  context?: string;
  /** Whether this binding is active. Defaults to `true`. */
  enabled?: boolean;
}

/** A fully resolved keybinding ready for registration. */
export interface ResolvedBinding extends KeyBinding {
  handler: () => void;
}
