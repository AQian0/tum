import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

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
  parent: HTMLElement;
  sessionId: string;
  ptyId: string;
  onInput: (data: string) => void;
  onResize: (rows: number, cols: number) => void;
  welcomeMessage?: string;
  fontSize?: number;
  fontFamily?: string;
  theme?: Partial<typeof DEFAULT_THEME>;
  rows?: number;
  cols?: number;
}

export interface PtyOutputPayload {
  session_id: string;
  pty_id: string;
  data: number[];
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
        opts.fontFamily ?? "'JetBrains Mono', 'Fira Code', ui-monospace, Consolas, monospace",
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

    this.xterm.onData((data) => this.handleInput(data, opts));
    this.xterm.onResize(({ rows, cols }) => this.handleResize(rows, cols, opts));

    this.resizeHandler = () => {
      if (!this.xterm.element?.isConnected) return;
      this.fitAddon.fit();
      this.fillToEdge();
    };
    window.addEventListener("resize", this.resizeHandler);
  }

  writeOutput(payload: PtyOutputPayload): void {
    if (payload.session_id === this.sessionId && payload.pty_id === this.ptyId) {
      this.xterm.write(new Uint8Array(payload.data));
    }
  }

  writeln(data: string): void {
    this.xterm.writeln(data);
  }

  write(data: string): void {
    this.xterm.write(data);
  }

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

  get terminal(): Terminal {
    return this.xterm;
  }

  get element(): HTMLElement | undefined {
    return this.xterm.element;
  }

  detach(): void {
    const el = this.xterm.element;
    if (el && el.parentElement) {
      el.parentElement.removeChild(el);
    }
  }

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

  private handleInput(data: string, opts: TerminalOptions): void {
    try {
      opts.onInput(data);
    } catch (err) {
      console.error("Error in terminal onInput callback:", err);
    }
  }

  private handleResize(rows: number, cols: number, opts: TerminalOptions): void {
    try {
      opts.onResize(rows, cols);
    } catch (err) {
      console.error("Error in terminal onResize callback:", err);
    }
  }
}
