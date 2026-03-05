import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, parseExtraCmdArg, runExtraCmd } from '../dist/extra-cmd.js';

// ============================================================================
// sanitize() tests
// ============================================================================

test('sanitize strips ANSI CSI sequences', () => {
  const input = '\x1B[31mRed\x1B[0m Text';
  assert.equal(sanitize(input), 'Red Text');
});

test('sanitize strips OSC sequences', () => {
  const input = '\x1B]0;Window Title\x07Normal Text';
  assert.equal(sanitize(input), 'Normal Text');
});

test('sanitize strips C0 control characters', () => {
  const input = 'Hello\x00World\x1FTest';
  assert.equal(sanitize(input), 'HelloWorldTest');
});

test('sanitize strips C1 control characters', () => {
  const input = 'Hello\x80World\x9FTest';
  assert.equal(sanitize(input), 'HelloWorldTest');
});

test('sanitize strips bidi control characters', () => {
  const input = 'Hello\u200EWorld\u202ATest\u2069End';
  assert.equal(sanitize(input), 'HelloWorldTestEnd');
});

test('sanitize preserves normal text', () => {
  const input = 'Just normal text 123!';
  assert.equal(sanitize(input), 'Just normal text 123!');
});

test('sanitize handles empty string', () => {
  assert.equal(sanitize(''), '');
});

test('sanitize handles complex mixed escape sequences', () => {
  const input = '\x1B[1;32mBold Green\x1B[0m \x1B]0;Title\x07 \x00Hidden\x1F';
  assert.equal(sanitize(input), 'Bold Green  Hidden');
});

// ============================================================================
// parseExtraCmdArg() tests
// ============================================================================

test('parseExtraCmdArg returns null when no --extra-cmd present', () => {
  const argv = ['node', 'index.js', '--other', 'arg'];
  assert.equal(parseExtraCmdArg(argv), null);
});

test('parseExtraCmdArg parses --extra-cmd value syntax', () => {
  const argv = ['node', 'index.js', '--extra-cmd', 'echo hello'];
  assert.equal(parseExtraCmdArg(argv), 'echo hello');
});

test('parseExtraCmdArg parses --extra-cmd=value syntax', () => {
  const argv = ['node', 'index.js', '--extra-cmd=echo hello'];
  assert.equal(parseExtraCmdArg(argv), 'echo hello');
});

test('parseExtraCmdArg returns null when --extra-cmd is last arg with space syntax', () => {
  const argv = ['node', 'index.js', '--extra-cmd'];
  assert.equal(parseExtraCmdArg(argv), null);
});

test('parseExtraCmdArg returns null for empty value with equals syntax', () => {
  const argv = ['node', 'index.js', '--extra-cmd='];
  assert.equal(parseExtraCmdArg(argv), null);
});

test('parseExtraCmdArg returns null for empty value with space syntax', () => {
  const argv = ['node', 'index.js', '--extra-cmd', ''];
  assert.equal(parseExtraCmdArg(argv), null);
});

test('parseExtraCmdArg handles command with equals sign in value', () => {
  const argv = ['node', 'index.js', '--extra-cmd=echo "key=value"'];
  assert.equal(parseExtraCmdArg(argv), 'echo "key=value"');
});

test('parseExtraCmdArg takes first occurrence when multiple present', () => {
  const argv = ['node', 'index.js', '--extra-cmd', 'first', '--extra-cmd', 'second'];
  assert.equal(parseExtraCmdArg(argv), 'first');
});

test('parseExtraCmdArg handles command with spaces and quotes', () => {
  const argv = ['node', 'index.js', '--extra-cmd', 'echo "hello world"'];
  assert.equal(parseExtraCmdArg(argv), 'echo "hello world"');
});

// ============================================================================
// runExtraCmd() tests
// ============================================================================

test('runExtraCmd returns ExtraCmdResult with label from valid JSON', async () => {
  const result = await runExtraCmd('echo \'{"label": "test"}\'');
  assert.deepStrictEqual(result, { label: 'test', lines: [] });
});

test('runExtraCmd returns ExtraCmdResult with lines from valid JSON', async () => {
  const result = await runExtraCmd('echo \'{"lines": ["line one", "line two"]}\'');
  assert.deepStrictEqual(result, { label: null, lines: ['line one', 'line two'] });
});

test('runExtraCmd returns ExtraCmdResult with both label and lines', async () => {
  const result = await runExtraCmd('echo \'{"label": "hi", "lines": ["detail"]}\'');
  assert.deepStrictEqual(result, { label: 'hi', lines: ['detail'] });
});

test('runExtraCmd returns null for non-JSON output', async () => {
  const result = await runExtraCmd('echo "not json"');
  assert.equal(result, null);
});

test('runExtraCmd returns null for JSON without label or lines', async () => {
  const result = await runExtraCmd('echo \'{"other": "field"}\'');
  assert.equal(result, null);
});

test('runExtraCmd returns null for JSON with non-string label', async () => {
  const result = await runExtraCmd('echo \'{"label": 123}\'');
  assert.equal(result, null);
});

test('runExtraCmd ignores non-string items in lines array', async () => {
  const result = await runExtraCmd('echo \'{"lines": ["valid", 123, null, "also valid"]}\'');
  assert.deepStrictEqual(result, { label: null, lines: ['valid', 'also valid'] });
});

test('runExtraCmd truncates long labels with ellipsis', async () => {
  const longLabel = 'a'.repeat(60);
  const result = await runExtraCmd(`echo '{"label": "${longLabel}"}'`);
  assert.equal(result?.label?.length, 50);
  assert.ok(result?.label?.endsWith('…'));
});

test('runExtraCmd truncates long lines with ellipsis', async () => {
  const longLine = 'b'.repeat(250);
  const result = await runExtraCmd(`echo '{"lines": ["${longLine}"]}'`);
  assert.equal(result?.lines[0]?.length, 200);
  assert.ok(result?.lines[0]?.endsWith('…'));
});

test('runExtraCmd sanitizes label containing escape sequences', async () => {
  const result = await runExtraCmd('echo \'{"label": "\\u001b[31mRed\\u001b[0m"}\'');
  assert.equal(result?.label, 'Red');
});

test('runExtraCmd sanitizes lines containing escape sequences', async () => {
  const result = await runExtraCmd('echo \'{"lines": ["\\u001b[31mRed\\u001b[0m"]}\'');
  assert.deepStrictEqual(result?.lines, ['Red']);
});

test('runExtraCmd returns null when command fails', async () => {
  const result = await runExtraCmd('exit 1');
  assert.equal(result, null);
});

test('runExtraCmd returns null when command does not exist', async () => {
  const result = await runExtraCmd('nonexistent-command-xyz123');
  assert.equal(result, null);
});

test('runExtraCmd handles timeout', async () => {
  const start = Date.now();
  const result = await runExtraCmd('sleep 10', 100);
  const elapsed = Date.now() - start;
  assert.equal(result, null);
  assert.ok(elapsed < 1000, `Expected timeout around 100ms, but took ${elapsed}ms`);
});

test('runExtraCmd handles empty stdout', async () => {
  const result = await runExtraCmd('echo ""');
  assert.equal(result, null);
});

test('runExtraCmd handles JSON array instead of object', async () => {
  const result = await runExtraCmd('echo \'[1,2,3]\'');
  assert.equal(result, null);
});

test('runExtraCmd handles null JSON', async () => {
  const result = await runExtraCmd('echo "null"');
  assert.equal(result, null);
});

test('runExtraCmd handles valid JSON with extra whitespace', async () => {
  const result = await runExtraCmd('echo \'  { "label": "trimmed" }  \'');
  assert.deepStrictEqual(result, { label: 'trimmed', lines: [] });
});
