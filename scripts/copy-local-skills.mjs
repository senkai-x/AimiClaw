#!/usr/bin/env zx

import 'zx/globals';
import { existsSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOCAL_SKILLS_DIR = join(ROOT, 'resources', 'local-skills');
const OUTPUT_DIR = join(ROOT, 'build', 'preinstalled-skills');

function isSkillDir(dirPath) {
  const skillFile = join(dirPath, 'SKILL.md');
  return existsSync(skillFile);
}

function copyLocalSkills() {
  if (!existsSync(LOCAL_SKILLS_DIR)) {
    console.log('Local skills directory not found, skipping...');
    return;
  }

  const entries = readdirSync(LOCAL_SKILLS_DIR);
  let copiedCount = 0;

  for (const entry of entries) {
    const sourcePath = join(LOCAL_SKILLS_DIR, entry);
    const stat = statSync(sourcePath);

    if (stat.isDirectory() && isSkillDir(sourcePath)) {
      const targetPath = join(OUTPUT_DIR, entry);
      cpSync(sourcePath, targetPath, { recursive: true });
      console.log(`Copied local skill: ${entry}`);
      copiedCount++;
    }
  }

  if (copiedCount > 0) {
    console.log(`Copied ${copiedCount} local skill(s) to preinstalled-skills`);
  }
}

copyLocalSkills();