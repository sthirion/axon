// PR body composition helpers (design doc §5.2/§8.3): the script-generated "## Changes"
// section from `git diff --numstat`, the work-item linking matrix, and the character budget
// that applies to every SCM. Pure functions — no network, no exec — so they're unit-testable
// without mocking anything.
import { truncate } from './output.mjs';

export const MODEL_BODY_LIMIT = 1500;
export const CHANGES_LIMIT = 1500;
export const TOTAL_LIMIT = 4000;
export const MAX_FILES_SHOWN = 15;

export class PrBodyError extends Error {}

/** Parses `git diff --numstat <target>...HEAD` output into `{ file, added, removed, total
 * }[]`. Uses --numstat rather than the --stat the plan sketches (§5.2) because --stat's bar
 * is scaled for display and doesn't give exact per-file insertions/deletions, which the
 * "+A/-D" summary line needs; --numstat is the machine-readable equivalent of the same
 * command. Binary files report "-" for both counts (§8: treated as 0 for sorting). */
export function parseNumstat(numstatOutput) {
  return (numstatOutput ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [addedRaw, removedRaw, ...fileParts] = line.split('\t');
      const added = addedRaw === '-' ? 0 : Number(addedRaw);
      const removed = removedRaw === '-' ? 0 : Number(removedRaw);
      return { file: fileParts.join('\t'), added, removed, total: added + removed };
    });
}

/** Renders the script-generated "## Changes" section (§5.2): top `MAX_FILES_SHOWN` files by
 * lines changed, then a single "...and N more files (+A/-D)" line for the rest. Always
 * truncated to CHANGES_LIMIT as a safety net (never expected to trigger with 15 lines, but
 * guards against pathologically long file paths). */
export function renderChangesSection(files, { limit = MAX_FILES_SHOWN } = {}) {
  if (!files || files.length === 0) return '## Changes\n\n_(no changes detected)_';

  const sorted = [...files].sort((a, b) => b.total - a.total);
  const shown = sorted.slice(0, limit);
  const rest = sorted.slice(limit);

  const lines = ['## Changes', ''];
  for (const file of shown) lines.push(`- \`${file.file}\` (+${file.added}/-${file.removed})`);
  if (rest.length > 0) {
    const restAdded = rest.reduce((sum, file) => sum + file.added, 0);
    const restRemoved = rest.reduce((sum, file) => sum + file.removed, 0);
    lines.push(`- ...and ${rest.length} more files (+${restAdded}/-${restRemoved})`);
  }
  return truncate(lines.join('\n'), CHANGES_LIMIT);
}

/** Builds the work-item link lines/refs for a PR body per the §8.3 matrix. `workItemIds` are
 * already-validated positive integers. Returns `{ bodyLines, workItemRefs, warning }`:
 * - `bodyLines`: markdown lines to append to the PR body (empty when linking is done via
 *   `workItemRefs` instead, or when linking isn't possible).
 * - `workItemRefs`: string ids to pass as `workItemRefs` on ADO SCM create (ADO tracker only),
 *   or null when not applicable.
 * - `warning`: a one-line warning to print (unsupported combo, or no tracker configured), or
 *   null. */
export function buildWorkItemLinks({ trackerType, scmVendor, workItemIds = [] }) {
  if (workItemIds.length === 0) return { bodyLines: [], workItemRefs: null, warning: null };

  if (!trackerType) {
    return {
      bodyLines: [],
      workItemRefs: null,
      warning: 'No tracker configured (tracker.config.json not found) - work items were not linked.',
    };
  }
  if (trackerType === 'github' && scmVendor === 'github') {
    return { bodyLines: workItemIds.map((id) => `Closes #${id}`), workItemRefs: null, warning: null };
  }
  if (trackerType === 'ado' && scmVendor === 'github') {
    return { bodyLines: workItemIds.map((id) => `AB#${id}`), workItemRefs: null, warning: null };
  }
  if (trackerType === 'ado' && scmVendor === 'ado') {
    return { bodyLines: [], workItemRefs: workItemIds.map(String), warning: null };
  }
  return {
    bodyLines: [],
    workItemRefs: null,
    warning: `Unsupported combination: ${trackerType} tracker + ${scmVendor} SCM - work items were not linked.`,
  };
}

/** Validates the model-written body against the §5.2 budget. Throws PrBodyError (map to exit
 * 2) with the exact message the plan mandates — never silently truncates model text. */
export function assertModelBodyBudget(body) {
  const length = (body ?? '').length;
  if (length > MODEL_BODY_LIMIT) {
    throw new PrBodyError(`PR body is ${length} chars; limit ${MODEL_BODY_LIMIT} - shorten the summary`);
  }
}

/** Composes the final PR body (model body + script "## Changes" + work-item link lines) and
 * validates the total against TOTAL_LIMIT (§5.2, enforced on every SCM). Returns the final
 * markdown string; throws PrBodyError if the total still exceeds the cap (e.g. an
 * unreasonably long `--work-items` list). */
export function composeBody({ modelBody, changesSection, linkLines = [] }) {
  const parts = [modelBody.trim(), changesSection.trim()];
  if (linkLines.length > 0) parts.push(linkLines.join('\n'));
  const composed = parts.join('\n\n');
  if (composed.length > TOTAL_LIMIT) {
    throw new PrBodyError(`Total PR body would be ${composed.length} chars; limit ${TOTAL_LIMIT} - reduce --work-items or shorten the summary`);
  }
  return composed;
}
