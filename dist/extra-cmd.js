import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);
const MAX_BUFFER = 10 * 1024;
const MAX_LABEL_LENGTH = 50;
const MAX_LINE_LENGTH = 200;
const MAX_EXTRA_LINES = 10;
const TIMEOUT_MS = 3000;
const isDebug = process.env.DEBUG?.includes('claude-hud') ?? false;
function debug(message) {
    if (isDebug) {
        console.error(`[claude-hud:extra-cmd] ${message}`);
    }
}
/**
 * Sanitize output to prevent terminal escape injection.
 * Strips ANSI escapes, OSC sequences, control characters, and bidi controls.
 */
export function sanitize(input) {
    return input
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '') // CSI sequences
        .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '') // OSC sequences
        .replace(/\x1B[@-Z\\-_]/g, '') // 7-bit C1 / ESC Fe
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // C0/C1 controls
        .replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u206A-\u206F]/g, ''); // bidi
}
function truncate(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return text.slice(0, maxLength - 1) + '…';
}
function sanitizeAndTruncate(text, maxLength) {
    return truncate(sanitize(text), maxLength);
}
function parseStringField(data, field) {
    const value = data[field];
    return typeof value === 'string' ? value : undefined;
}
function parseStringArray(data, field) {
    const value = data[field];
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string');
}
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Parse --extra-cmd argument from process.argv
 * Supports both: --extra-cmd "command" and --extra-cmd="command"
 */
export function parseExtraCmdArg(argv = process.argv) {
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--extra-cmd=')) {
            const value = arg.slice('--extra-cmd='.length);
            if (value === '') {
                debug('Warning: --extra-cmd value is empty, ignoring');
                return null;
            }
            return value;
        }
        if (arg === '--extra-cmd') {
            if (i + 1 >= argv.length) {
                debug('Warning: --extra-cmd specified but no value provided');
                return null;
            }
            const value = argv[i + 1];
            if (value === '') {
                debug('Warning: --extra-cmd value is empty, ignoring');
                return null;
            }
            return value;
        }
    }
    return null;
}
function parseExtraCmdOutput(data) {
    if (!isPlainObject(data)) {
        debug(`Command output is not an object: ${JSON.stringify(data)}`);
        return null;
    }
    const rawLabel = parseStringField(data, 'label');
    const rawLines = parseStringArray(data, 'lines');
    if (rawLabel === undefined && rawLines.length === 0) {
        debug(`Command output has neither 'label' nor 'lines': ${JSON.stringify(data)}`);
        return null;
    }
    return {
        label: rawLabel !== undefined ? sanitizeAndTruncate(rawLabel, MAX_LABEL_LENGTH) : null,
        lines: rawLines
            .map(line => sanitizeAndTruncate(line, MAX_LINE_LENGTH))
            .slice(0, MAX_EXTRA_LINES),
    };
}
/**
 * Execute a command and parse JSON output.
 *
 * Supports two response formats:
 * - Legacy: { "label": "text" } — single inline label (max 50 chars)
 * - Extended: { "lines": ["line1", "line2"] } — rendered as additional HUD lines
 * - Both: { "label": "text", "lines": ["line1"] } — label inline + extra lines
 *
 * SECURITY NOTE: The cmd parameter is sourced exclusively from CLI arguments
 * (--extra-cmd) typed by the user. Since the user controls their own shell,
 * shell injection is not a concern here - it's intentional user input.
 */
export async function runExtraCmd(cmd, timeout = TIMEOUT_MS) {
    try {
        const { stdout } = await execAsync(cmd, {
            timeout,
            maxBuffer: MAX_BUFFER,
        });
        return parseExtraCmdOutput(JSON.parse(stdout.trim()));
    }
    catch (err) {
        if (err instanceof Error) {
            if (err.message.includes('TIMEOUT') || err.message.includes('killed')) {
                debug(`Command timed out after ${timeout}ms: ${cmd}`);
            }
            else if (err instanceof SyntaxError) {
                debug(`Failed to parse JSON output: ${err.message}`);
            }
            else {
                debug(`Command failed: ${err.message}`);
            }
        }
        else {
            debug(`Command failed with unknown error`);
        }
        return null;
    }
}
//# sourceMappingURL=extra-cmd.js.map