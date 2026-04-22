import type { RenderContext } from '../../types.js';
import { getModelName, getProviderLabel } from '../../stdin.js';
import { cyan, dim, magenta, yellow, red } from '../colors.js';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function getTerminalWidth(): number | null {
  const cols = process.stdout?.columns;
  if (typeof cols === 'number' && Number.isFinite(cols) && cols > 0) {
    return Math.floor(cols);
  }
  const envCols = Number.parseInt(process.env.COLUMNS ?? '', 10);
  if (Number.isFinite(envCols) && envCols > 0) {
    return envCols;
  }
  return null;
}

function visualWidth(str: string): number {
  return str.replace(ANSI_RE, '').length;
}

function truncatePathLeft(path: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (path.length <= maxWidth) return path;
  if (maxWidth <= 1) return '\u2026';
  return '\u2026' + path.slice(-(maxWidth - 1));
}

const PATH_PLACEHOLDER = '\x00PATH\x00';

export function renderProjectLine(ctx: RenderContext): string | null {
  const display = ctx.config?.display;
  const parts: string[] = [];

  if (display?.showModel !== false) {
    const model = getModelName(ctx.stdin);
    const providerLabel = getProviderLabel(ctx.stdin);
    const showUsage = display?.showUsage !== false;
    const planName = showUsage ? ctx.usageData?.planName : undefined;
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    const billingLabel = showUsage ? (planName ?? (hasApiKey ? red('API') : undefined)) : undefined;
    const planDisplay = providerLabel ?? billingLabel;
    const modelDisplay = planDisplay ? `${model} | ${planDisplay}` : model;
    parts.push(cyan(`[${modelDisplay}]`));
  }

  let projectPart: string | null = null;
  let rawProjectPath = '';
  if (display?.showProject !== false && ctx.stdin.cwd) {
    const segments = ctx.stdin.cwd.split(/[/\\]/).filter(Boolean);
    rawProjectPath = segments.length > 0 ? segments.join('/') : '/';
    projectPart = PATH_PLACEHOLDER;
  }

  let gitPart = '';
  const gitConfig = ctx.config?.gitStatus;
  const showGit = gitConfig?.enabled ?? true;

  if (showGit && ctx.gitStatus) {
    const gitParts: string[] = [ctx.gitStatus.branch];

    if ((gitConfig?.showDirty ?? true) && ctx.gitStatus.isDirty) {
      gitParts.push('*');
    }

    if (gitConfig?.showAheadBehind) {
      if (ctx.gitStatus.ahead > 0) {
        gitParts.push(` ↑${ctx.gitStatus.ahead}`);
      }
      if (ctx.gitStatus.behind > 0) {
        gitParts.push(` ↓${ctx.gitStatus.behind}`);
      }
    }

    if (gitConfig?.showFileStats && ctx.gitStatus.fileStats) {
      const { modified, added, deleted, untracked } = ctx.gitStatus.fileStats;
      const statParts: string[] = [];
      if (modified > 0) statParts.push(`!${modified}`);
      if (added > 0) statParts.push(`+${added}`);
      if (deleted > 0) statParts.push(`✘${deleted}`);
      if (untracked > 0) statParts.push(`?${untracked}`);
      if (statParts.length > 0) {
        gitParts.push(` ${statParts.join(' ')}`);
      }
    }

    gitPart = `${magenta('git:(')}${cyan(gitParts.join(''))}${magenta(')')}`;
  }

  if (projectPart && gitPart) {
    parts.push(`${projectPart} ${gitPart}`);
  } else if (projectPart) {
    parts.push(projectPart);
  } else if (gitPart) {
    parts.push(gitPart);
  }

  if (display?.showSessionName && ctx.transcript.sessionName) {
    parts.push(dim(ctx.transcript.sessionName));
  }

  if (parts.length === 0) {
    return null;
  }

  let line = parts.join(' \u2502 ');

  // Replace path placeholder with left-truncated path that fits available terminal width
  if (rawProjectPath && line.includes(PATH_PLACEHOLDER)) {
    const terminalWidth = getTerminalWidth();
    if (terminalWidth) {
      const lineWithoutPath = line.replace(PATH_PLACEHOLDER, '');
      const usedWidth = visualWidth(lineWithoutPath);
      const available = terminalWidth - usedWidth;
      const fitted = truncatePathLeft(rawProjectPath, available);
      if (fitted) {
        line = line.replace(PATH_PLACEHOLDER, yellow(fitted));
      } else {
        line = line.replace(PATH_PLACEHOLDER + ' ', '').replace(PATH_PLACEHOLDER, '');
      }
    } else {
      // No terminal width — fall back to pathLevels behavior
      const segments = rawProjectPath.split('/').filter(Boolean);
      const pathLevels = ctx.config?.pathLevels ?? 1;
      const fallback = segments.length > 0 ? segments.slice(-pathLevels).join('/') : '/';
      line = line.replace(PATH_PLACEHOLDER, yellow(fallback));
    }
  }

  return line;
}
