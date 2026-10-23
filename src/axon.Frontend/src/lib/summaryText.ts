import type { HistoryEntry } from '@axon/shared';

// Plain text for the clipboard: one line per story in finish order, then the total.
export function summaryText(history: readonly HistoryEntry[], total: number): string {
  const lines = history.map((entry, index) => {
    const link = entry.url ? ` (${entry.url})` : '';
    return `${index + 1}. ${entry.title}${link} - ${entry.estimate}`;
  });
  return [...lines, `Total: ${total}`].join('\n');
}
