import { getSearchAddon, getTerminalInstance } from './terminal-pane.js';

const searchBars = new Map<string, HTMLDivElement>();

export function showSearchBar(sessionId: string): void {
  const existing = searchBars.get(sessionId);
  if (existing) {
    existing.classList.remove('hidden');
    const input = existing.querySelector('input') as HTMLInputElement;
    input.focus();
    input.select();
    return;
  }

  const instance = getTerminalInstance(sessionId);
  if (!instance) return;

  const bar = document.createElement('div');
  bar.className = 'search-bar';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search...';
  input.spellcheck = false;

  const matchCaseBtn = document.createElement('button');
  matchCaseBtn.className = 'search-toggle-btn';
  matchCaseBtn.textContent = 'Aa';
  matchCaseBtn.title = 'Match Case';

  const regexBtn = document.createElement('button');
  regexBtn.className = 'search-toggle-btn';
  regexBtn.textContent = '.*';
  regexBtn.title = 'Use Regular Expression';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'search-nav-btn';
  prevBtn.textContent = '\u2191';
  prevBtn.title = 'Previous Match (Shift+Enter)';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'search-nav-btn';
  nextBtn.textContent = '\u2193';
  nextBtn.title = 'Next Match (Enter)';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'search-nav-btn search-close-btn';
  closeBtn.textContent = '\u2715';
  closeBtn.title = 'Close (Escape)';

  bar.appendChild(input);
  bar.appendChild(matchCaseBtn);
  bar.appendChild(regexBtn);
  bar.appendChild(prevBtn);
  bar.appendChild(nextBtn);
  bar.appendChild(closeBtn);

  instance.element.appendChild(bar);
  searchBars.set(sessionId, bar);

  let caseSensitive = false;
  let regex = false;

  function getOptions() {
    return { caseSensitive, regex };
  }

  function doSearch() {
    const addon = getSearchAddon(sessionId);
    if (!addon || !input.value) return;
    addon.findNext(input.value, getOptions());
  }

  input.addEventListener('input', doSearch);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const addon = getSearchAddon(sessionId);
      if (!addon || !input.value) return;
      if (e.shiftKey) {
        addon.findPrevious(input.value, getOptions());
      } else {
        addon.findNext(input.value, getOptions());
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideSearchBar(sessionId);
    }
    // Prevent Cmd+F from bubbling when search bar is focused
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      input.select();
    }
  });

  matchCaseBtn.addEventListener('click', () => {
    caseSensitive = !caseSensitive;
    matchCaseBtn.classList.toggle('active', caseSensitive);
    doSearch();
  });

  regexBtn.addEventListener('click', () => {
    regex = !regex;
    regexBtn.classList.toggle('active', regex);
    doSearch();
  });

  prevBtn.addEventListener('click', () => {
    const addon = getSearchAddon(sessionId);
    if (addon && input.value) addon.findPrevious(input.value, getOptions());
  });

  nextBtn.addEventListener('click', () => {
    const addon = getSearchAddon(sessionId);
    if (addon && input.value) addon.findNext(input.value, getOptions());
  });

  closeBtn.addEventListener('click', () => hideSearchBar(sessionId));

  input.focus();
}

export function hideSearchBar(sessionId: string): void {
  const bar = searchBars.get(sessionId);
  if (!bar) return;
  bar.classList.add('hidden');

  // Clear search decorations
  const addon = getSearchAddon(sessionId);
  if (addon) addon.clearDecorations();

  // Refocus terminal
  const instance = getTerminalInstance(sessionId);
  if (instance) instance.terminal.focus();
}

export function isSearchBarVisible(sessionId: string): boolean {
  const bar = searchBars.get(sessionId);
  return !!bar && !bar.classList.contains('hidden');
}
