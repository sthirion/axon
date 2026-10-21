type Dict = Record<string, unknown>;

const JOB_ID = 'build-test';

// Fails the job when the build leaves any untracked or modified file behind.
const CLEAN_TREE_STEP = 'test -z "$(git status --porcelain)"';

const UPLOAD_PATHS = ['src/axon.E2ETests/playwright-report', 'src/axon.E2ETests/test-results'];

const EXPECTED_STEPS = [
  'actions/checkout',
  'actions/setup-node',
  'npm ci',
  'npm run lint',
  'npm run typecheck',
  'npm run build',
  CLEAN_TREE_STEP,
  'npm run test:unit',
  'npm run test:integration',
  'npm run test:frontend',
  'npm run test:dev-smoke',
  'npx playwright install --with-deps chromium',
  'npm run test:e2e',
  'actions/upload-artifact',
];

const EXACT_USES: Record<string, string> = {
  'actions/checkout': 'actions/checkout@v4',
  'actions/setup-node': 'actions/setup-node@v4',
  'actions/upload-artifact': 'actions/upload-artifact@v4',
};

const PLAYWRIGHT_INSTALL = 'npx playwright install --with-deps chromium';
const E2E_DIR = 'src/axon.E2ETests';

const PINNED_USES = /^[\w.-]+\/[\w./-]+@(v\d+(\.\d+){0,2}|[0-9a-f]{40})$/;

function isRecord(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includesMain(trigger: unknown): boolean {
  return isRecord(trigger) && Array.isArray(trigger.branches) && trigger.branches.includes('main');
}

function stepId(step: Dict): string {
  if (typeof step.run === 'string') return step.run.trim();
  if (typeof step.uses === 'string') return step.uses.split('@')[0];
  return '<unknown step>';
}

function isReadOnlyPermissions(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([scope, level]) => level === 'none' || (scope === 'contents' && level === 'read'),
  );
}

function checkTriggers(doc: Dict, violations: string[]): void {
  const on = doc.on;
  if (!isRecord(on) || !includesMain(on.pull_request)) {
    violations.push('trigger: pull_request to main is required');
  }
  if (!isRecord(on) || !includesMain(on.push)) {
    violations.push('trigger: push to main is required');
  }
}

function checkPermissions(doc: Dict, jobs: Dict, violations: string[]): void {
  const permissions = doc.permissions;
  if (
    !isRecord(permissions) ||
    Object.keys(permissions).length !== 1 ||
    permissions.contents !== 'read'
  ) {
    violations.push('permissions: top level must be exactly { contents: read }');
  }
  for (const [name, job] of Object.entries(jobs)) {
    if (isRecord(job) && job.permissions !== undefined && !isReadOnlyPermissions(job.permissions)) {
      violations.push(`permissions: job "${name}" widens the top-level permissions`);
    }
  }
}

function checkConcurrency(doc: Dict, violations: string[]): void {
  const concurrency = doc.concurrency;
  if (!isRecord(concurrency)) {
    violations.push('concurrency: group is required');
    return;
  }
  const group = typeof concurrency.group === 'string' ? concurrency.group : '';
  if (!group.includes('github.workflow') || !group.includes('github.ref')) {
    violations.push('concurrency: group must use github.workflow and github.ref');
  }
  if (concurrency['cancel-in-progress'] !== true) {
    violations.push('concurrency: cancel-in-progress must be true');
  }
}

function checkSteps(steps: Dict[], violations: string[]): void {
  const actual = steps.map(stepId);
  if (actual.join('\n') !== EXPECTED_STEPS.join('\n')) {
    violations.push(
      `steps: expected order [${EXPECTED_STEPS.join(' | ')}] but found [${actual.join(' | ')}]`,
    );
  }

  for (const step of steps) {
    const id = stepId(step);
    if ('continue-on-error' in step)
      violations.push(`step "${id}": continue-on-error is not allowed`);
    if (typeof step.uses === 'string' && !PINNED_USES.test(step.uses)) {
      violations.push(`step "${id}": uses must be pinned to @vN or a 40-char SHA`);
    }
    if ('if' in step) {
      const isUpload = id === 'actions/upload-artifact';
      if (!isUpload || step.if !== 'failure()') {
        violations.push(`step "${id}": if is only allowed on the upload step with failure()`);
      }
    }
  }

  checkExactActionVersions(steps, violations);
  checkSetupNode(steps, violations);
  checkPlaywrightInstall(steps, violations);
  checkUpload(steps, violations);
}

function checkExactActionVersions(steps: Dict[], violations: string[]): void {
  for (const step of steps) {
    const id = stepId(step);
    const expected = EXACT_USES[id];
    if (expected && step.uses !== expected) {
      violations.push(`step "${id}": uses must be exactly ${expected}`);
    }
  }
}

function checkSetupNode(steps: Dict[], violations: string[]): void {
  const setup = steps.find((step) => stepId(step) === 'actions/setup-node');
  const withBlock = isRecord(setup?.with) ? setup.with : {};
  if (String(withBlock['node-version']) !== '20') {
    violations.push('setup-node: node-version must be 20');
  }
  if (withBlock.cache !== 'npm') {
    violations.push('setup-node: cache must be npm');
  }
}

function checkPlaywrightInstall(steps: Dict[], violations: string[]): void {
  const install = steps.find((step) => stepId(step) === PLAYWRIGHT_INSTALL);
  if (install?.['working-directory'] !== E2E_DIR) {
    violations.push(`playwright install: working-directory must be ${E2E_DIR}`);
  }
}

function checkUpload(steps: Dict[], violations: string[]): void {
  const upload = steps.find((step) => stepId(step) === 'actions/upload-artifact');
  if (!upload || upload.if !== 'failure()') {
    violations.push('upload: must run with if: failure()');
  }
  const withBlock = isRecord(upload?.with) ? upload.with : {};
  const uploadPath = typeof withBlock.path === 'string' ? withBlock.path : '';
  const actual = uploadPath
    .split('\n')
    .map((line) => line.trim().replace(/\/+$/, ''))
    .filter((line) => line !== '');
  for (const required of UPLOAD_PATHS) {
    if (!actual.includes(required)) violations.push(`upload: path must include ${required}`);
  }
  for (const extra of actual.filter((line) => !UPLOAD_PATHS.includes(line))) {
    violations.push(`upload: unexpected path ${extra}`);
  }
}

export function checkWorkflow(doc: unknown): string[] {
  const violations: string[] = [];
  if (!isRecord(doc)) return ['workflow: document must be a mapping'];

  checkTriggers(doc, violations);
  checkConcurrency(doc, violations);

  const jobs = isRecord(doc.jobs) ? doc.jobs : {};
  checkPermissions(doc, jobs, violations);

  const job = jobs[JOB_ID];
  if (!isRecord(job)) {
    violations.push(`jobs: "${JOB_ID}" is required`);
    return violations;
  }
  if (job['runs-on'] !== 'ubuntu-latest') violations.push('jobs: runs-on must be ubuntu-latest');
  if ('continue-on-error' in job) violations.push('jobs: continue-on-error is not allowed');
  if ('if' in job) violations.push('jobs: if is not allowed');

  const steps = Array.isArray(job.steps) ? job.steps.filter(isRecord) : [];
  checkSteps(steps, violations);
  return violations;
}
