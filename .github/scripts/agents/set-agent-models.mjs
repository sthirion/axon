#!/usr/bin/env node
// Manages model assignments between model-config.json and .agent.md frontmatter.
// Usage:
//   node set-agent-models.mjs                 list current model in each agent file
//   node set-agent-models.mjs --set           apply models from model-config.json
//   node set-agent-models.mjs --set --dry-run preview changes without writing
//   node set-agent-models.mjs --strict        exit 1 if any agent uses a non-approved model

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(__dirname, '..', '..', 'agents');
const configPath = join(agentsDir, 'model-config.json');

const args = new Set(process.argv.slice(2));
const doSet = args.has('--set');
const strict = args.has('--strict');
const dryRun = args.has('--dry-run');

const c = {
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const MODEL_LINE = /^model:\s*(.+)$/m;

function readModel(content) {
  const fm = content.match(FRONTMATTER);
  if (!fm) return null;
  const m = fm[1].match(MODEL_LINE);
  return m ? m[1].trim() : null;
}

function agentFiles() {
  return readdirSync(agentsDir)
    .filter((f) => f.endsWith('.agent.md'))
    .sort();
}

// --- Default: list current model per agent ---
if (!doSet) {
  for (const file of agentFiles()) {
    const content = readFileSync(join(agentsDir, file), 'utf8');
    const model = readModel(content) ?? '(no model found)';
    const name = file.replace(/\.agent\.md$/, '');
    console.log(`${name.padEnd(25)} ${model}`);
  }
  process.exit(0);
}

// --- Load config ---
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const tiers = config.tiers ?? {};
const approvedModels = config.approvedModels ?? [];
const agents = config.agents ?? [];

// --- Validation phase ---
const warnings = [];
for (const agent of agents) {
  const tierKey = agent.primary;
  if (!(tierKey in tiers)) {
    warnings.push(`[ERROR] Agent '${agent.name}': tier '${tierKey}' is not defined in 'tiers'.`);
    continue;
  }
  const model = tiers[tierKey];
  if (!approvedModels.includes(model)) {
    warnings.push(`[ERROR] Agent '${agent.name}': model '${model}' (tier '${tierKey}') is not in approvedModels.`);
  }
}

if (strict && warnings.length > 0) {
  for (const w of warnings) console.log(c.red(w));
  console.log(c.red('\nValidation failed. No files were modified.'));
  process.exit(1);
}
for (const w of warnings) console.log(c.yellow(w));

// --- Patch phase ---
const agentNames = agents.map((a) => a.name);
for (const agent of agents) {
  const tierKey = agent.primary;
  if (!(tierKey in tiers)) {
    console.log(c.yellow(`[WARNING] Agent '${agent.name}': tier '${tierKey}' not found in tiers — skipping.`));
    continue;
  }
  const targetModel = tiers[tierKey];
  const agentFile = join(agentsDir, `${agent.name}.agent.md`);

  let content;
  try {
    content = readFileSync(agentFile, 'utf8');
  } catch {
    console.log(c.yellow(`[WARNING] No .agent.md found for agent '${agent.name}'`));
    continue;
  }

  const fm = content.match(FRONTMATTER);
  if (!fm) {
    console.log(c.yellow(`[WARNING] ${agent.name}.agent.md: no YAML frontmatter found — skipping.`));
    continue;
  }
  const oldModel = readModel(content);
  if (!oldModel) {
    console.log(c.yellow(`[WARNING] ${agent.name}.agent.md: no 'model:' line in frontmatter — skipping.`));
    continue;
  }
  if (oldModel === targetModel) {
    console.log(c.gray(`[NO CHANGE] ${agent.name}.agent.md`));
    continue;
  }
  if (dryRun) {
    console.log(c.cyan(`[DRY RUN] ${agent.name}.agent.md: would change ${oldModel} → ${targetModel}`));
    continue;
  }
  // Replace only the model: line inside the frontmatter block, preserving line endings.
  const newFrontmatter = fm[1].replace(/^(model:\s*).+?(\r?)$/m, `$1${targetModel}$2`);
  const newContent = content.replace(fm[1], newFrontmatter);
  writeFileSync(agentFile, newContent);
  console.log(c.green(`[UPDATED] ${agent.name}.agent.md: ${oldModel} → ${targetModel}`));
}

// --- Orphan check ---
for (const file of agentFiles()) {
  const baseName = file.replace(/\.agent\.md$/, '');
  if (!agentNames.includes(baseName)) {
    console.log(c.yellow(`[WARNING] ${file}: no entry in model-config.json`));
  }
}
