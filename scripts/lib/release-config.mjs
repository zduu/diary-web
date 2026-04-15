import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

export const rootDir = process.cwd();

export const requiredSecretKeys = ['SESSION_SECRET'];

export const recommendedSecretKeys = [
  'ADMIN_BOOTSTRAP_PASSWORD',
  'APP_BOOTSTRAP_PASSWORD',
  'STATS_API_KEY',
];

export const optionalImageSecretKeys = ['IMAGES_API_TOKEN'];

export async function fileExists(relativePath) {
  try {
    await access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function readRootText(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

export function assertIncludes(content, fragment, message, errors) {
  if (!content.includes(fragment)) {
    errors.push(message);
  }
}

function stripTomlInlineComment(line) {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"' && !escaped) {
      inString = !inString;
    }

    if (character === '#' && !inString) {
      return line.slice(0, index).trimEnd();
    }

    escaped = character === '\\' && !escaped;
    if (character !== '\\') {
      escaped = false;
    }
  }

  return line;
}

export function stripTomlComments(content) {
  return content
    .split('\n')
    .map((line) => stripTomlInlineComment(line))
    .join('\n');
}

function extractTomlString(content, key, section = null) {
  const lines = content.split('\n');
  let activeSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      activeSection = trimmed;
      continue;
    }

    if (section && activeSection !== section) {
      continue;
    }

    const match = trimmed.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"$`));
    if (match) {
      return match[1];
    }
  }

  return null;
}

export function parseWranglerReleaseConfig(content) {
  const activeWranglerContent = stripTomlComments(content);

  return {
    raw: content,
    active: activeWranglerContent,
    projectName: extractTomlString(activeWranglerContent, 'name'),
    pagesBuildOutputDir: extractTomlString(activeWranglerContent, 'pages_build_output_dir'),
    d1Binding: extractTomlString(activeWranglerContent, 'binding', '[[d1_databases]]'),
    d1DatabaseName: extractTomlString(activeWranglerContent, 'database_name', '[[d1_databases]]'),
    d1DatabaseId: extractTomlString(activeWranglerContent, 'database_id', '[[d1_databases]]'),
    environment: extractTomlString(activeWranglerContent, 'ENVIRONMENT', '[vars]'),
    appTimezone: extractTomlString(activeWranglerContent, 'APP_TIMEZONE', '[vars]'),
    imagesVariant: extractTomlString(activeWranglerContent, 'IMAGES_VARIANT', '[vars]'),
  };
}

export async function loadWranglerReleaseConfig() {
  const wranglerContent = await readRootText('wrangler.toml');
  return parseWranglerReleaseConfig(wranglerContent);
}
