import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  loadReleaseConfig,
  optionalImageSecretKeys,
  requiredSecretKeys,
  recommendedSecretKeys,
} from './lib/release-config.mjs';

const execFileAsync = promisify(execFile);

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readOption(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function printChecklist(title, items) {
  console.log(title);
  for (const item of items) {
    console.log(`- ${item}`);
  }
}

function pushError(errors, message) {
  errors.push(message);
}

async function runWranglerJson(args) {
  const { stdout } = await execFileAsync('npx', ['wrangler', ...args, '--json'], {
    cwd: process.cwd(),
    env: process.env,
  });

  return JSON.parse(stdout);
}

function extractProjectNames(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => item?.name)
    .filter((value) => typeof value === 'string');
}

function extractDatabaseId(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload.uuid || payload.database_id || payload.id || null;
}

const errors = [];
const warnings = [];

const remoteMode = hasFlag('--remote');
const skipD1 = hasFlag('--skip-d1');
const projectOverride = readOption('--project');
const databaseOverride = readOption('--database');
const smokeUrl = readOption('--smoke-url');

const wranglerConfig = await loadReleaseConfig({ allowDashboardManaged: true });
const projectName = projectOverride || wranglerConfig.projectName;
const databaseName = databaseOverride || wranglerConfig.d1DatabaseName;

if (!projectName) {
  pushError(errors, `无法从 ${wranglerConfig.sourcePath} 解析项目名，请使用 --project 指定`);
}

if (wranglerConfig.pagesBuildOutputDir !== 'dist') {
  pushError(errors, `${wranglerConfig.sourcePath} 的 pages_build_output_dir 不是 dist`);
}

if (wranglerConfig.dashboardManaged) {
  warnings.push('未发现 wrangler.toml，当前按 Cloudflare Dashboard 管理绑定与变量的发布方式检查');
  warnings.push('本地无法读取 Dashboard 绑定详情；上线前需确认 Pages 项目已绑定 D1 到 DB');
} else {
  if (wranglerConfig.d1Binding !== 'DB') {
    pushError(errors, 'wrangler.toml 的 D1 绑定不是 DB');
  }

  if (!databaseName) {
    pushError(errors, '无法从 wrangler.toml 解析 database_name，请使用 --database 指定');
  }

  if (!wranglerConfig.d1DatabaseId) {
    pushError(errors, 'wrangler.toml 缺少 database_id');
  }
}

if (wranglerConfig.environment !== 'production') {
  warnings.push('wrangler.toml 的 ENVIRONMENT 不是 production');
}

if (!wranglerConfig.appTimezone) {
  warnings.push('wrangler.toml 未声明 APP_TIMEZONE');
}

if (!wranglerConfig.imagesVariant) {
  warnings.push('wrangler.toml 未声明 IMAGES_VARIANT');
}

printChecklist('Cloudflare 发布前本地核对', [
  `Pages 项目名: ${projectName ?? '未解析'}`,
  `D1 数据库: ${databaseName ?? '未解析'}`,
  `D1 database_id: ${wranglerConfig.d1DatabaseId ?? '未解析'}`,
  `必需 Secrets: ${requiredSecretKeys.join(', ')}`,
  `建议 Secrets: ${recommendedSecretKeys.join(', ')}`,
  `按需 Secrets（启用图片上传时）: ${optionalImageSecretKeys.join(', ')}`,
]);

if (!remoteMode) {
  warnings.push('未启用 --remote，已跳过 Cloudflare 账号、Pages 项目和 D1 远端存在性检查');
} else {
  try {
    await runWranglerJson(['whoami']);
  } catch (error) {
    pushError(errors, 'Cloudflare 远端检查失败：当前未登录 wrangler，请先执行 wrangler login');
  }

  if (errors.length === 0) {
    try {
      const pagesProjects = await runWranglerJson(['pages', 'project', 'list']);
      const projectNames = extractProjectNames(pagesProjects);

      if (!projectName || !projectNames.includes(projectName)) {
        pushError(errors, `Cloudflare Pages 中未找到项目: ${projectName}`);
      }
    } catch (error) {
      pushError(errors, '无法读取 Cloudflare Pages 项目列表，请检查 wrangler 认证或权限');
    }
  }

  if (errors.length === 0 && !skipD1 && databaseName) {
    try {
      const d1Info = await runWranglerJson(['d1', 'info', databaseName]);
      const remoteDatabaseId = extractDatabaseId(d1Info);

      if (!remoteDatabaseId) {
        warnings.push('已读取 D1 信息，但无法从返回结果解析数据库 ID');
      } else if (wranglerConfig.d1DatabaseId && remoteDatabaseId !== wranglerConfig.d1DatabaseId) {
        pushError(errors, `D1 database_id 不匹配，本地=${wranglerConfig.d1DatabaseId}，远端=${remoteDatabaseId}`);
      }
    } catch (error) {
      pushError(errors, `无法读取 D1 信息: ${databaseName}`);
    }
  } else if (errors.length === 0 && !skipD1 && !databaseName) {
    warnings.push('未提供 D1 数据库名，已跳过 D1 远端存在性检查；可使用 --database 指定');
  }

  if (smokeUrl) {
    warnings.push(`已提供 smoke URL，请额外执行: npm run smoke:remote -- ${smokeUrl}`);
  }
}

if (warnings.length > 0) {
  printChecklist('提示', warnings);
}

if (errors.length > 0) {
  printChecklist('Cloudflare 校验失败', errors);
  process.exit(1);
}

console.log('Cloudflare 发布准备检查通过');
