export type PasteTarget = 'terminal' | 'input' | 'other';

export function classifyTarget(el: Element | null): PasteTarget {
  if (!el) return 'other';
  if (el.closest('.terminal-pane')) return 'terminal';
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return 'input';
  if ((el as HTMLElement).isContentEditable) return 'input';
  return 'other';
}

export function buildPtyPasteString(text: string, bracketedPasteMode: boolean): string {
  if (!text) return '';
  return bracketedPasteMode ? `\x1b[200~${text}\x1b[201~` : text;
}

type WriteToFocusedTerminal = (data: string) => boolean;
type GetBracketedPaste = () => boolean;

export function createPasteDispatcher(deps: {
  writeToFocusedTerminal: WriteToFocusedTerminal;
  isFocusedTerminalBracketedPaste: GetBracketedPaste;
  pasteNative: () => void;
}) {
  return async function dispatchPaste(): Promise<void> {
    const target = classifyTarget(document.activeElement);
    if (target === 'terminal') {
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }
      const bp = deps.isFocusedTerminalBracketedPaste();
      const data = buildPtyPasteString(text, bp);
      if (data) deps.writeToFocusedTerminal(data);
    } else if (target === 'input') {
      deps.pasteNative();
    }
    // 'other' → no-op
  };
}
