import { JavascriptInputDraft } from './workflow-editor.types';

export const JAVASCRIPT_MANAGED_INPUTS_START_MARKER = '// <wf-inputs>';
export const JAVASCRIPT_MANAGED_INPUTS_END_MARKER = '// </wf-inputs>';
export const JAVASCRIPT_AUTO_INPUT_PREFIX = 'valor';
export const JAVASCRIPT_DEFAULT_RESULT_KEY = 'result';
export const JAVASCRIPT_DEFAULT_RESPONSE_SAMPLE = {
  count: 1,
  total: 0,
  hasTruthy: false,
  values: {
    valor1: '',
  },
} as const;

export const JAVASCRIPT_VARIABLE_COLOR_PALETTE: ReadonlyArray<string> = [
  '#1f6feb',
  '#0f8b8d',
  '#cc5803',
  '#9b5de5',
  '#2a9d8f',
  '#c03a2b',
  '#3a86ff',
  '#588157',
];

const JAVASCRIPT_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function escapeRegexToken(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeJavascriptInputName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function collectManagedInputNames(inputs: JavascriptInputDraft[]): string[] {
  if (!Array.isArray(inputs)) {
    return [];
  }

  const names: string[] = [];
  const used = new Set<string>();
  for (const row of inputs) {
    const candidate = normalizeJavascriptInputName(row?.name);
    if (!isValidJavascriptIdentifierName(candidate)) {
      continue;
    }

    const normalizedCandidate = candidate.toLowerCase();
    if (used.has(normalizedCandidate)) {
      continue;
    }

    used.add(normalizedCandidate);
    names.push(candidate);
  }

  return names;
}

export function isValidJavascriptIdentifierName(value: string): boolean {
  return JAVASCRIPT_IDENTIFIER_PATTERN.test(String(value ?? '').trim());
}

export function getNextAutoInputName(inputs: JavascriptInputDraft[]): string {
  const usedIndices = new Set<number>();
  if (Array.isArray(inputs)) {
    for (const row of inputs) {
      const name = normalizeJavascriptInputName(row?.name).toLowerCase();
      const match = new RegExp(`^${JAVASCRIPT_AUTO_INPUT_PREFIX}(\\d+)$`, 'i').exec(name);
      if (!match) {
        continue;
      }

      const parsedIndex = Number(match[1]);
      if (Number.isInteger(parsedIndex) && parsedIndex > 0) {
        usedIndices.add(parsedIndex);
      }
    }
  }

  let nextIndex = 1;
  while (usedIndices.has(nextIndex)) {
    nextIndex += 1;
  }

  return `${JAVASCRIPT_AUTO_INPUT_PREFIX}${nextIndex}`;
}

export function renderManagedInputsBlock(inputs: JavascriptInputDraft[]): string {
  const inputNames = collectManagedInputNames(inputs);

  const objectLines = inputNames.length
    ? inputNames.map((name) => `  ${name},`).join('\n')
    : '  // Sin variables validas definidas en Inputs.';

  return [
    JAVASCRIPT_MANAGED_INPUTS_START_MARKER,
    '// Variables sincronizadas automaticamente desde Inputs del nodo.',
    'const __wfInputs = Object.freeze({',
    objectLines,
    '});',
    JAVASCRIPT_MANAGED_INPUTS_END_MARKER,
  ].join('\n');
}

export function ensureManagedBlock(
  codeRaw: string,
  inputs: JavascriptInputDraft[],
): string {
  const code = typeof codeRaw === 'string' ? codeRaw : '';
  const startIndex = code.indexOf(JAVASCRIPT_MANAGED_INPUTS_START_MARKER);
  const endIndex = code.indexOf(JAVASCRIPT_MANAGED_INPUTS_END_MARKER);
  if (startIndex >= 0 && endIndex > startIndex) {
    return code;
  }

  const managedBlock = renderManagedInputsBlock(inputs);
  const preservedCode = code.trim().length ? `\n\n${code}` : '';
  return `${managedBlock}${preservedCode}`;
}

export function syncManagedInputsIntoCode(
  codeRaw: string,
  inputs: JavascriptInputDraft[],
): string {
  const codeWithMarkers = ensureManagedBlock(codeRaw, inputs);
  const managedBlock = renderManagedInputsBlock(inputs);
  const managedBlockPattern = new RegExp(
    `${escapeRegexToken(JAVASCRIPT_MANAGED_INPUTS_START_MARKER)}[\\s\\S]*?${escapeRegexToken(JAVASCRIPT_MANAGED_INPUTS_END_MARKER)}`,
  );

  if (!managedBlockPattern.test(codeWithMarkers)) {
    return codeWithMarkers;
  }

  return codeWithMarkers.replace(managedBlockPattern, managedBlock);
}

export function resolveJavascriptVariableColorIndex(
  nameRaw: string,
  paletteSize = JAVASCRIPT_VARIABLE_COLOR_PALETTE.length,
): number {
  if (paletteSize <= 1) {
    return 0;
  }

  const name = String(nameRaw ?? '').trim().toLowerCase();
  if (!name) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }

  return hash % paletteSize;
}

export function buildDefaultJavascriptInputs(): JavascriptInputDraft[] {
  return [
    {
      id: 'js-input-1',
      name: `${JAVASCRIPT_AUTO_INPUT_PREFIX}1`,
      value: '',
    },
  ];
}

export function buildDefaultJavascriptCode(inputs: JavascriptInputDraft[]): string {
  const baseCode = [
    'const toNumber = (value, fallback = 0) => {',
    '  const parsed = Number(value);',
    '  return Number.isFinite(parsed) ? parsed : fallback;',
    '};',
    '',
    'const toBoolean = (value) => {',
    "  if (typeof value === 'boolean') return value;",
    "  if (typeof value === 'number') return value !== 0;",
    "  const text = String(value ?? '').trim().toLowerCase();",
    "  return text === 'true' || text === '1' || text === 'yes' || text === 'si';",
    '};',
    '',
    "const safeText = (value) => String(value ?? '').trim();",
    '',
    'const entries = Object.entries(__wfInputs);',
    'const total = entries.reduce(',
    '  (acc, [, value]) => acc + toNumber(value, 0),',
    '  0,',
    ');',
    '',
    'const output = {',
    '  count: entries.length,',
    '  total,',
    '  hasTruthy: entries.some(([, value]) => toBoolean(value)),',
    '  values: Object.fromEntries(',
    "    entries.map(([key, value]) => [key, typeof value === 'string' ? safeText(value) : value]),",
    '  ),',
    '};',
    '',
    'return output;',
  ].join('\n');

  return syncManagedInputsIntoCode(baseCode, inputs);
}

export function buildDefaultJavascriptResponseSampleText(): string {
  try {
    return JSON.stringify(JAVASCRIPT_DEFAULT_RESPONSE_SAMPLE, null, 2);
  } catch {
    return '{\n  "count": 1\n}';
  }
}

