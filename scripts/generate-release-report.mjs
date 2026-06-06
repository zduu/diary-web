import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadReleaseConfig, rootDir } from './lib/release-config.mjs';

const execFileAsync = promisify(execFile);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function readOption(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function formatTimestamp(date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} Asia/Shanghai`;
}

function defaultOutputPath(date) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  return path.join(rootDir, 'reports', `release-report-${stamp}.md`);
}

function tailLines(text, maxLines = 40) {
  const lines = text.trim().split('\n');
  if (lines.length <= maxLines) {
    return lines.join('\n');
  }

  return ['...（已截断，仅保留最后部分输出）', ...lines.slice(-maxLines)].join('\n');
}

async function safeGit(args) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: rootDir,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function runCommand(command, args) {
  const startedAt = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: rootDir,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      success: true,
      code: 0,
      durationMs: Date.now() - startedAt,
      output: [stdout, stderr].filter(Boolean).join('\n').trim(),
    };
  } catch (error) {
    return {
      success: false,
      code: error.code ?? 1,
      durationMs: Date.now() - startedAt,
      output: [error.stdout, error.stderr].filter(Boolean).join('\n').trim(),
    };
  }
}

const reportDate = new Date();
const outputPath = path.resolve(readOption('--output') ?? defaultOutputPath(reportDate));
const smokeUrl = readOption('--smoke-url') ?? process.env.SMOKE_BASE_URL ?? null;
const withCloudflareRemote = hasFlag('--cloudflare-remote');
const withAdminSmoke = Boolean(process.env.SMOKE_ADMIN_PASSWORD) && Boolean(smokeUrl);

const steps = [
  {
    name: '本地发布门禁',
    command: npmCommand,
    args: ['run', 'check'],
  },
];

if (smokeUrl) {
  steps.push({
    name: '预发匿名 Smoke Test',
    command: npmCommand,
    args: ['run', 'smoke:remote', '--', smokeUrl],
  });
}

if (withAdminSmoke) {
  steps.push({
    name: '预发管理员 Smoke Test',
    command: npmCommand,
    args: ['run', 'smoke:remote:admin', '--', smokeUrl],
  });
}

if (withCloudflareRemote) {
  const args = ['scripts/check-cloudflare.mjs', '--remote'];
  if (smokeUrl) {
    args.push('--smoke-url', smokeUrl);
  }

  steps.push({
    name: 'Cloudflare 远端存在性检查',
    command: 'node',
    args,
  });
}

const stepResults = [];
for (const step of steps) {
  // eslint-disable-next-line no-await-in-loop
  const result = await runCommand(step.command, step.args);
  stepResults.push({
    ...step,
    ...result,
  });

  if (!result.success) {
    break;
  }
}

const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const wranglerConfig = await loadReleaseConfig({ allowDashboardManaged: true });
const gitBranch = await safeGit(['rev-parse', '--abbrev-ref', 'HEAD']);
const gitCommit = await safeGit(['rev-parse', 'HEAD']);
const gitShortCommit = await safeGit(['rev-parse', '--short', 'HEAD']);

const summaryLines = stepResults.map((step) => {
  const status = step.success ? 'PASS' : 'FAIL';
  return `| ${step.name} | ${status} | ${step.code} | ${step.durationMs}ms |`;
});

const detailSections = stepResults.map((step) => {
  const output = step.output ? tailLines(step.output) : '无输出';
  return [
    `## ${step.name}`,
    '',
    `- 状态: ${step.success ? '通过' : '失败'}`,
    `- 退出码: ${step.code}`,
    `- 耗时: ${step.durationMs}ms`,
    `- 命令: \`${[step.command, ...step.args].join(' ')}\``,
    '',
    '```text',
    output,
    '```',
  ].join('\n');
});

const report = [
  '# Release Report',
  '',
  `- 生成时间: ${formatTimestamp(reportDate)}`,
  `- 项目: ${packageJson.name}`,
  `- 版本: ${packageJson.version}`,
  `- 分支: ${gitBranch ?? '未知'}`,
  `- 提交: ${gitShortCommit ?? gitCommit ?? '未知'}`,
  `- 发布配置: ${wranglerConfig.dashboardManaged ? 'Cloudflare Dashboard 管理' : wranglerConfig.sourcePath}`,
  `- Pages 项目: ${wranglerConfig.projectName ?? '未知'}`,
  `- D1 数据库: ${wranglerConfig.d1DatabaseName ?? '未知'}`,
  `- 预发地址: ${smokeUrl ?? '未提供'}`,
  '',
  '## Summary',
  '',
  '| Step | Status | Exit Code | Duration |',
  '| --- | --- | --- | --- |',
  ...summaryLines,
  '',
  ...detailSections,
  '',
].join('\n');

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, report, 'utf8');

console.log(`发布报告已生成: ${outputPath}`);

if (stepResults.some((step) => !step.success)) {
  process.exit(1);
}
