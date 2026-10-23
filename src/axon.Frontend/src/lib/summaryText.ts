import type { HistoryEntry } from '@axon/shared';

// Plain text for the clipboard: one line per story in finish order, then the total (sizes have none).
export function summaryText(history: readonly HistoryEntry[], total: number | null): string {
  const lines = history.map((entry, index) => {
    // A story with no title is just its link; do not print the link twice.
    const label = entry.title === '' ? (entry.url ?? '') : entry.title;
    const link = entry.title !== '' && entry.url ? ` (${entry.url})` : '';
    return `${index + 1}. ${label}${link} - ${entry.estimate}`;
  });
  return (total === null ? lines : [...lines, `Total: ${total}`]).join('\n');
}
