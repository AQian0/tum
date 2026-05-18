import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { writePty, resizePty } from "@tum/core";
import type { PtyInputRequest, PtyOutputEvent, PtyResizeRequest } from "@tum/core";


const DEFAULT_THEME = {
  background: "#0d0e14",
  foreground: "#c8c8d0",
  cursor: "#c084fc",
  cursorAccent: "#0d0e14",
  selectionBackground: "#ffffff20",
  selectionForeground: "#c8c8d0",
  black: "#1a1b26",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
  white: "#c8c8d0",
  brightBlack: "#414868",
  brightRed: "#f7768e",
  brightGreen: "#9ece6a",
  brightYellow: "#e0af68",
  brightBlue: "#7aa2f7",
  brightMagenta: "#bb9af7",
  brightCyan: "#7dcfff",
  brightWhite: "#d5d6db",
};


export interface TerminalOptions {
  /** The DOM element to mount the terminal into. */
  parent: HTMLElement;
  /** Session and PTY IDs for routing I/O to the correct backend PTY. */
  sessionId: string;
  ptyId: string;
  /** Optional welcome message written on mount. */
  welcomeMessage?: string;
  /** Font size in pixels (default 14). */
  fontSize?: number;
  /** Font family (defaults to monospace stack). */
  fontFamily?: string;
  /** Partial theme overrides merged on top of DEFAULT_THEME. */
  theme?: Partial<typeof DEFAULT_THEME>;
  /** Initial dimensions (default 80×24). */
  rows?: number;
  cols?: number;
}


export class TumTerminal {
  private xterm: Terminal;
  private fitAddon: FitAddon;
  private resizeHandler: () => void;
  private sessionId: string;
  private ptyId: string;

  constructor(opts: TerminalOptions) {
    this.sessionId = opts.sessionId;
    this.ptyId = opts.ptyId;

    this.xterm = new Terminal({
      rows: opts.rows ?? 24,
      cols: opts.cols ?? 80,
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: opts.fontSize ?? 14,
      fontFamily:
        opts.fontFamily ??
        "'JetBrains Mono', 'Fira Code', ui-monospace, Consolas, monospace",
      theme: { ...DEFAULT_THEME, ...opts.theme },
    });

    this.fitAddon = new FitAddon();
    this.xterm.loadAddon(this.fitAddon);

    try {
      this.xterm.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available; canvas renderer is the fallback.
    }

    this.xterm.loadAddon(new WebLinksAddon());

    this.xterm.open(opts.parent);
    requestAnimationFrame(() => {
      this.fitAddon.fit();
      this.fillToEdge();
    });

    if (opts.welcomeMessage) {
      this.xterm.writeln(opts.welcomeMessage);
    }

    this.xterm.onData((data) => this.handleInput(data));
    this.xterm.onResize(({ rows, cols }) => this.handleResize(rows, cols));

    // Window resize → re-fit the terminal (skip if detached)
    this.resizeHandler = () => {
      if (!this.xterm.element?.isConnected) return;
      this.fitAddon.fit();
      this.fillToEdge();
    };
    window.addEventListener("resize", this.resizeHandler);
  }


  /** Write PTY output to the terminal display. */
  writeOutput(event: PtyOutputEvent): void {
    if (event.session_id === this.sessionId && event.pty_id === this.ptyId) {
      this.xterm.write(new Uint8Array(event.data));
    }
  }

  /** Write a line of text followed by CR/LF. */
  writeln(data: string): void {
    this.xterm.writeln(data);
  }

  /** Write raw text (no automatic line break). */
  write(data: string): void {
    this.xterm.write(data);
  }

  /** Resize to fill the container + fillToEdge. */
  fit(): void {
    this.fitAddon.fit();
    this.fillToEdge();
  }

  focus(): void {
    this.xterm.focus();
  }

  dispose(): void {
    window.removeEventListener("resize", this.resizeHandler);
    this.xterm.dispose();
  }

  /** The underlying xterm.js Terminal (for advanced API access). */
  get terminal(): Terminal {
    return this.xterm;
  }

  /** The root DOM element of this terminal. */
  get element(): HTMLElement | undefined {
    return this.xterm.element;
  }

  /**
   * Detach the terminal element from its current DOM parent without
   * disposing the terminal instance.  The terminal keeps running and
   * continues receiving PTY output (the buffer stays up to date).
   *
   * Use {@link attach} to re-mount it into a visible container later.
   */
  detach(): void {
    const el = this.xterm.element;
    if (el && el.parentElement) {
      el.parentElement.removeChild(el);
    }
  }

  /**
   * Re-attach a previously detached terminal into a new parent element.
   * Automatically re-fits the terminal to fill the container.
   */
  attach(parent: HTMLElement): void {
    const el = this.xterm.element;
    if (!el) return;
    parent.appendChild(el);
    requestAnimationFrame(() => {
      this.fitAddon.fit();
      this.fillToEdge();
    });
  }


  /**
   * After FitAddon determines column/row count via floor, add one extra
   * row when the remaining vertical space exceeds half a character height
   * so the terminal truly fills the container with no gap at the bottom.
   */
  private fillToEdge(): void {
    try {
      const core = (this.xterm as any)._core;
      const charHeight: number | undefined = core?._charSizeService?.height;
      if (!charHeight || charHeight <= 0) return;

      const element = this.xterm.element!;
      const parent = element.parentElement!;

      const style = window.getComputedStyle(parent);
      const paddingTop = parseInt(style.paddingTop) || 0;
      const paddingBottom = parseInt(style.paddingBottom) || 0;
      const availableHeight = parent.clientHeight - paddingTop - paddingBottom;

      const usedHeight = this.xterm.rows * charHeight;
      const remaining = availableHeight - usedHeight;

      if (remaining > charHeight * 0.5) {
        this.xterm.resize(this.xterm.cols, this.xterm.rows + 1);
      }
    } catch {
      // Private API may change; silently keep the FitAddon result.
    }
  }

  private handleInput(data: string): void {
    const encoder = new TextEncoder();
    const bytes = Array.from(encoder.encode(data));

    const req: PtyInputRequest = {
      session_id: this.sessionId,
      pty_id: this.ptyId,
      data: bytes,
    };

    writePty(req).catch((err) =>
      console.error("Failed to write to PTY:", err),
    );
  }

  private handleResize(rows: number, cols: number): void {
    const req: PtyResizeRequest = {
      session_id: this.sessionId,
      pty_id: this.ptyId,
      rows,
      cols,
    };

    resizePty(req).catch((err) =>
      console.error("Failed to resize PTY:", err),
    );
  }
}
