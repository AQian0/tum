import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

const defaultTheme = {
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
  theme?: Partial<typeof defaultTheme>;
  rows?: number;
  cols?: number;
}

export interface PtyOutputPayload {
  sessionId: string;
  ptyId: string;
  data: number[];
}

export class TumTerminal {
  private xterm: Terminal;
  private fitAddon: FitAddon;
  private resizeHandler: () => void;
  private resizeObserver: ResizeObserver | null = null;
  private fitFrame: number | null = null;
  private parent: HTMLElement;
  private sessionId: string;
  private ptyId: string;
  private disposed = false;

  constructor(options: TerminalOptions) {
    this.sessionId = options.sessionId;
    this.ptyId = options.ptyId;
    this.parent = options.parent;

    this.xterm = new Terminal({
      rows: options.rows ?? 24,
      cols: options.cols ?? 80,
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: options.fontSize ?? 14,
      fontFamily:
        options.fontFamily ?? "'JetBrains Mono', 'Fira Code', ui-monospace, Consolas, monospace",
      theme: { ...defaultTheme, ...options.theme },
    });

    this.fitAddon = new FitAddon();
    this.xterm.loadAddon(this.fitAddon);

    try {
      this.xterm.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available; canvas renderer is the fallback.
    }

    this.xterm.loadAddon(new WebLinksAddon());

    this.xterm.open(this.parent);

    if (options.welcomeMessage) {
      this.xterm.writeln(options.welcomeMessage);
    }

    this.xterm.onData((data) => this.handleInput(data, options));
    this.xterm.onResize(({ rows, cols }) => this.handleResize(rows, cols, options));

    this.resizeHandler = () => this.scheduleFit();
    window.addEventListener("resize", this.resizeHandler);

    this.resizeObserver = new ResizeObserver(() => this.scheduleFit());
    this.resizeObserver.observe(this.parent);

    this.scheduleFit();
  }

  writeOutput(payload: PtyOutputPayload): void {
    if (payload.sessionId === this.sessionId && payload.ptyId === this.ptyId) {
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
    this.fitToParent();
  }

  focus(): void {
    this.xterm.focus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("resize", this.resizeHandler);
    this.resizeObserver?.disconnect();
    if (this.fitFrame !== null) {
      window.cancelAnimationFrame(this.fitFrame);
      this.fitFrame = null;
    }
    this.xterm.dispose();
  }

  get terminal(): Terminal {
    return this.xterm;
  }

  get element(): HTMLElement | undefined {
    return this.xterm.element;
  }

  detach(): void {
    this.resizeObserver?.disconnect();
    if (this.fitFrame !== null) {
      window.cancelAnimationFrame(this.fitFrame);
      this.fitFrame = null;
    }

    const element = this.xterm.element;
    if (element && element.parentElement) {
      element.parentElement.removeChild(element);
    }
  }

  attach(parent: HTMLElement): void {
    const element = this.xterm.element;
    if (!element || this.disposed) return;

    this.parent = parent;
    parent.appendChild(element);
    this.resizeObserver?.disconnect();
    this.resizeObserver?.observe(parent);
    this.scheduleFit();
  }

  private scheduleFit(): void {
    if (this.disposed || !this.xterm.element?.isConnected || this.fitFrame !== null) return;

    this.fitFrame = window.requestAnimationFrame(() => {
      this.fitFrame = null;
      this.fitToParent();
    });
  }

  private fitToParent(): void {
    if (this.disposed || !this.xterm.element?.isConnected) return;

    const parent = this.xterm.element.parentElement;
    if (!parent || parent.clientWidth <= 0 || parent.clientHeight <= 0) return;

    this.fitAddon.fit();
    this.fillToEdge();
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

  private handleInput(data: string, options: TerminalOptions): void {
    try {
      options.onInput(data);
    } catch (error) {
      console.error("Error in terminal onInput callback:", error);
    }
  }

  private handleResize(rows: number, cols: number, options: TerminalOptions): void {
    try {
      options.onResize(rows, cols);
    } catch (error) {
      console.error("Error in terminal onResize callback:", error);
    }
  }
}
