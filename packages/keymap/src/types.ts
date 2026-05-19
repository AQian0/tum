export interface KeyStroke {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export interface KeyBinding {
  id: string;
  description?: string;
  keys: KeyStroke[];
  context?: string;
  enabled?: boolean;
}

export interface ResolvedBinding extends KeyBinding {
  handler: () => void;
}
