import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const DEFAULT_THEME = {
  background: '#0d0e14',
  foreground: '#c8c8d0',
  cursor: '#c084fc',
  cursorAccent: '#0d0e14',
  selectionBackground: '#ffffff20',
  selectionForeground: '#c8c8d0',
  black: '#1a1b26',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#c8c8d0',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#d5d6db',
}

export interface TumTerminalOptions {
  container: HTMLElement
  welcomeMessage?: string
  fontSize?: number
  fontFamily?: string
  theme?: Partial<typeof DEFAULT_THEME>
}

export class TumTerminal {
  readonly xterm: XTerm
  private fitAddon: FitAddon
  private resizeHandler: () => void

  constructor(options: TumTerminalOptions) {
    this.xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: options.fontSize ?? 14,
      fontFamily:
        options.fontFamily ??
        "'JetBrains Mono', 'Fira Code', ui-monospace, Consolas, monospace",
      theme: { ...DEFAULT_THEME, ...options.theme },
      allowProposedApi: true,
      allowTransparency: false,
      cols: 80,
      rows: 24,
    })

    this.fitAddon = new FitAddon()
    this.xterm.loadAddon(this.fitAddon)

    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      this.xterm.loadAddon(webgl)
    } catch {
    }

    this.xterm.loadAddon(new WebLinksAddon())

    this.xterm.open(options.container)

    requestAnimationFrame(() => {
      this.fitAddon.fit()
      this.fillToEdge()
    })

    if (options.welcomeMessage) {
      this.xterm.writeln(options.welcomeMessage)
    }

    this.resizeHandler = () => {
      this.fitAddon.fit()
      this.fillToEdge()
    }
    window.addEventListener('resize', this.resizeHandler)
  }

  fit(): void {
    this.fitAddon.fit()
    this.fillToEdge()
  }

  /**
   * After FitAddon determines the column/row count using floor,
   * this method adds one extra row when the remaining vertical
   * space exceeds half a character height — so the terminal
   * truly fills the container with no gap at the bottom.
   */
  private fillToEdge(): void {
    try {
      // Access xterm's internal character-measurement service.
      // This is the most reliable way to get actual rendered
      // cell dimensions (accounts for font loading, scaling, etc.)
      const core = (this.xterm as any)._core
      const charHeight: number | undefined = core?._charSizeService?.height
      if (!charHeight || charHeight <= 0) return

      const element = this.xterm.element!
      const parent = element.parentElement!

      const style = window.getComputedStyle(parent)
      const paddingTop = parseInt(style.paddingTop) || 0
      const paddingBottom = parseInt(style.paddingBottom) || 0
      const availableHeight = parent.clientHeight - paddingTop - paddingBottom

      const usedHeight = this.xterm.rows * charHeight
      const remaining = availableHeight - usedHeight

      // Only add a row when the remaining space is meaningful
      if (remaining > charHeight * 0.5) {
        this.xterm.resize(this.xterm.cols, this.xterm.rows + 1)
      }
    } catch {
      // If anything goes wrong (e.g. private API changed),
      // silently keep the FitAddon result.
    }
  }

  writeln(data: string): void {
    this.xterm.writeln(data)
  }

  write(data: string): void {
    this.xterm.write(data)
  }

  onData(callback: (data: string) => void): void {
    this.xterm.onData(callback)
  }

  resize(cols: number, rows: number): void {
    this.xterm.resize(cols, rows)
  }

  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler)
    this.xterm.dispose()
  }
}
