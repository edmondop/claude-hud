export interface ExtraCmdResult {
    label: string | null;
    lines: string[];
}
/**
 * Sanitize output to prevent terminal escape injection.
 * Strips ANSI escapes, OSC sequences, control characters, and bidi controls.
 */
export declare function sanitize(input: string): string;
/**
 * Parse --extra-cmd argument from process.argv
 * Supports both: --extra-cmd "command" and --extra-cmd="command"
 */
export declare function parseExtraCmdArg(argv?: string[]): string | null;
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
export declare function runExtraCmd(cmd: string, timeout?: number): Promise<ExtraCmdResult | null>;
//# sourceMappingURL=extra-cmd.d.ts.map