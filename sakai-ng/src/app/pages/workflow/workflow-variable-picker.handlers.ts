import {
  VariablePickerEntry,
  VariablePickerGlobalEntry,
  VariablePickerOriginGroup,
  VARIABLE_TARGET_PROPERTY_MAP,
  buildVariablePickerCollections,
  findVariableTokenRangeForDeletion,
  insertTokenInVariableField,
  normalizeVariablePickerSearch,
  resolveVariableCandidatesForEditor,
  shouldBlockTokenEdgeDeletion,
} from './workflow-variable-picker.utils';
import {
  VariablePickerTargetField,
  normalizePrevTokenArtifacts,
} from './workflow-runtime.utils';

export function hasVariableCandidatesForEditorHandler(ctx: any): boolean {
  return resolveVariableCandidatesForEditor({
    cy: ctx.cy,
    targetNodeId: ctx.editNodeId.trim(),
    isAdderNode: (node) => ctx.isAdderNode(node),
  }).length > 0;
}

export function openVariablePickerForFieldHandler(
  ctx: any,
  field: VariablePickerTargetField,
): void {
  const variables = resolveVariableCandidatesForEditor({
    cy: ctx.cy,
    targetNodeId: ctx.editNodeId.trim(),
    isAdderNode: (node) => ctx.isAdderNode(node),
  });
  if (!variables.length) {
    ctx.statusMessage = 'Este workflow no tiene variables JSON disponibles para este nodo.';
    ctx.requestUiRefresh();
    return;
  }

  ctx.variablePickerTargetField = field;
  const sourceLabels = new Set(
    variables.map((variable) => variable.sourceNodeLabel),
  );
  ctx.variablePickerSourceNodeLabel = `${variables.length} variables en ${sourceLabels.size} nodos`;
  ctx.variablePickerVariables = variables;
  ctx.variablePickerSearch = '';
  ctx.variablePickerExpandedAmbiguousId = '';
  const pickerCollections = buildVariablePickerCollections(variables);
  ctx.variablePickerGlobalEntries = pickerCollections.globalEntries;
  ctx.variablePickerOriginGroups = pickerCollections.originGroups;
  ctx.variablePickerDialogVisible = true;
  ctx.requestUiRefresh();
}

export function closeVariablePickerDialogHandler(ctx: any): void {
  ctx.variablePickerDialogVisible = false;
  ctx.variablePickerSourceNodeLabel = '';
  ctx.variablePickerSearch = '';
  ctx.variablePickerExpandedAmbiguousId = '';
  ctx.variablePickerTargetField = null;
  ctx.variablePickerVariables = [];
  ctx.variablePickerGlobalEntries = [];
  ctx.variablePickerOriginGroups = [];
  if (typeof ctx.clearDecisionRuleOperandTarget === 'function') {
    ctx.clearDecisionRuleOperandTarget();
  }
  if (typeof ctx.clearJavascriptInputValueTarget === 'function') {
    ctx.clearJavascriptInputValueTarget();
  }
}

export function applyVariableFromPickerHandler(
  ctx: any,
  variable: VariablePickerEntry,
): void {
  const tokenPath = String(variable?.tokenPath ?? '').trim();
  if (!tokenPath) {
    ctx.statusMessage = 'La variable seleccionada no es valida.';
    ctx.requestUiRefresh();
    return;
  }

  if (
    typeof ctx.applyVariableTokenToDecisionOperand === 'function' &&
    ctx.applyVariableTokenToDecisionOperand(tokenPath)
  ) {
    closeVariablePickerDialogHandler(ctx);
    ctx.requestUiRefresh();
    return;
  }

  if (
    typeof ctx.applyVariableTokenToJavascriptInput === 'function' &&
    ctx.applyVariableTokenToJavascriptInput(tokenPath)
  ) {
    closeVariablePickerDialogHandler(ctx);
    ctx.requestUiRefresh();
    return;
  }

  const targetField = ctx.variablePickerTargetField;
  if (!targetField) {
    return;
  }

  const token = ctx.getVariableTokenPreview(tokenPath);
  const currentValue = readValueByVariableTargetFieldValue(ctx, targetField);
  const insertionResult = insertTokenInVariableField(
    currentValue,
    token,
    ctx.variableFieldSelections[targetField],
  );
  ctx.variableFieldSelections[targetField] = insertionResult.nextSelection;
  writeValueByVariableTargetFieldHandler(ctx, targetField, insertionResult.nextValue);

  closeVariablePickerDialogHandler(ctx);
  ctx.requestUiRefresh();
}

export function applyGlobalVariableCandidateFromPickerHandler(
  ctx: any,
  entry: VariablePickerGlobalEntry,
  candidate?: VariablePickerEntry,
): void {
  if (candidate) {
    applyVariableFromPickerHandler(ctx, candidate);
    return;
  }

  if (entry.isAmbiguous) {
    toggleVariablePickerAmbiguousEntryHandler(ctx, entry.id);
    return;
  }

  if (entry.globalTokenPath?.trim()) {
    if (
      typeof ctx.applyVariableTokenToDecisionOperand === 'function' &&
      ctx.applyVariableTokenToDecisionOperand(entry.globalTokenPath.trim())
    ) {
      closeVariablePickerDialogHandler(ctx);
      ctx.requestUiRefresh();
      return;
    }

    if (
      typeof ctx.applyVariableTokenToJavascriptInput === 'function' &&
      ctx.applyVariableTokenToJavascriptInput(entry.globalTokenPath.trim())
    ) {
      closeVariablePickerDialogHandler(ctx);
      ctx.requestUiRefresh();
      return;
    }

    const targetField = ctx.variablePickerTargetField;
    if (!targetField) {
      return;
    }

    const token = ctx.getVariableTokenPreview(entry.globalTokenPath.trim());
    const currentValue = readValueByVariableTargetFieldValue(ctx, targetField);
    const insertionResult = insertTokenInVariableField(
      currentValue,
      token,
      ctx.variableFieldSelections[targetField],
    );
    ctx.variableFieldSelections[targetField] = insertionResult.nextSelection;
    writeValueByVariableTargetFieldHandler(ctx, targetField, insertionResult.nextValue);
    closeVariablePickerDialogHandler(ctx);
    ctx.requestUiRefresh();
    return;
  }

  const fallback = entry.candidates[0];
  if (!fallback) {
    ctx.statusMessage = 'La variable seleccionada no es valida.';
    ctx.requestUiRefresh();
    return;
  }

  applyVariableFromPickerHandler(ctx, fallback);
}

export function onVariablePickerSearchInputHandler(
  ctx: any,
  event: Event,
): void {
  const target = event.target as HTMLInputElement | null;
  ctx.variablePickerSearch = target?.value ?? '';
}

export function getFilteredVariablePickerGlobalEntriesHandler(
  ctx: any,
): VariablePickerGlobalEntry[] {
  const search = normalizeVariablePickerSearch(ctx.variablePickerSearch);
  if (!search) {
    return ctx.variablePickerGlobalEntries;
  }

  return ctx.variablePickerGlobalEntries.filter((entry: VariablePickerGlobalEntry) => {
    if (normalizeVariablePickerSearch(entry.key).includes(search)) {
      return true;
    }

    return entry.candidates.some((candidate) => {
      const sourceLabel = `${candidate.sourceTypeLabel} ${candidate.sourceNodeLabel}`;
      return normalizeVariablePickerSearch(sourceLabel).includes(search);
    });
  });
}

export function getFilteredVariablePickerOriginGroupsHandler(
  ctx: any,
): VariablePickerOriginGroup[] {
  const search = normalizeVariablePickerSearch(ctx.variablePickerSearch);
  if (!search) {
    return ctx.variablePickerOriginGroups;
  }

  return ctx.variablePickerOriginGroups
    .map((group: VariablePickerOriginGroup) => {
      const groupMatches = normalizeVariablePickerSearch(
        `${group.drawerLabel} ${group.sourceName}`,
      ).includes(search);

      const variables = groupMatches
        ? group.variables
        : group.variables.filter((variable) =>
            normalizeVariablePickerSearch(variable.key).includes(search),
          );

      return {
        ...group,
        variables,
      };
    })
    .filter((group: VariablePickerOriginGroup) => group.variables.length > 0);
}

export function isVariablePickerAmbiguousEntryExpandedValue(
  ctx: any,
  entryId: string,
): boolean {
  return ctx.variablePickerExpandedAmbiguousId === entryId;
}

export function toggleVariablePickerAmbiguousEntryHandler(
  ctx: any,
  entryId: string,
): void {
  ctx.variablePickerExpandedAmbiguousId =
    ctx.variablePickerExpandedAmbiguousId === entryId ? '' : entryId;
}

export function captureVariableFieldSelectionHandler(
  ctx: any,
  field: VariablePickerTargetField,
  event: Event,
): void {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!target) {
    return;
  }

  const start =
    typeof target.selectionStart === 'number'
      ? target.selectionStart
      : target.value.length;
  const end =
    typeof target.selectionEnd === 'number' ? target.selectionEnd : start;

  ctx.variableFieldSelections[field] = {
    start: Math.max(0, start),
    end: Math.max(0, end),
  };
}

export function onVariableFieldFocusHandler(
  ctx: any,
  field: VariablePickerTargetField,
): void {
  ctx.focusedVariableField = field;
}

export function onVariableFieldBlurHandler(
  ctx: any,
  field: VariablePickerTargetField,
): void {
  if (ctx.focusedVariableField === field) {
    ctx.focusedVariableField = null;
  }
}

export function isVariableFieldFocusedValue(
  ctx: any,
  field: VariablePickerTargetField,
): boolean {
  return ctx.focusedVariableField === field;
}

export function onVariableFieldKeydownHandler(
  ctx: any,
  field: VariablePickerTargetField,
  event: KeyboardEvent,
): void {
  const isBackspace = event.key === 'Backspace';
  const isDelete = event.key === 'Delete' || event.key === 'Del';
  if (!isBackspace && !isDelete) {
    return;
  }

  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!target) {
    return;
  }

  const value = target.value ?? '';
  const selectionStart =
    typeof target.selectionStart === 'number'
      ? target.selectionStart
      : value.length;
  const selectionEnd =
    typeof target.selectionEnd === 'number' ? target.selectionEnd : selectionStart;

  const mode = isBackspace ? 'backspace' : 'delete';
  const tokenRange = findVariableTokenRangeForDeletion(
    value,
    selectionStart,
    selectionEnd,
    mode,
  );
  if (!tokenRange) {
    if (
      shouldBlockTokenEdgeDeletion(value, selectionStart, selectionEnd, mode)
    ) {
      event.preventDefault();
    }
    return;
  }

  event.preventDefault();
  const nextValueRaw = value.slice(0, tokenRange.start) + value.slice(tokenRange.end);
  const nextValue = normalizePrevTokenArtifacts(nextValueRaw);
  writeValueByVariableTargetFieldHandler(ctx, field, nextValue);

  const nextCursor = Math.min(tokenRange.start, nextValue.length);
  ctx.variableFieldSelections[field] = {
    start: nextCursor,
    end: nextCursor,
  };

  queueMicrotask(() => {
    try {
      target.setSelectionRange(nextCursor, nextCursor);
    } catch {
      // Ignore selection errors on non-focusable targets.
    }
  });

  ctx.requestUiRefresh();
}

export function readValueByVariableTargetFieldValue(
  ctx: any,
  field: VariablePickerTargetField,
): string {
  const property = VARIABLE_TARGET_PROPERTY_MAP[field];
  return String(ctx[property] ?? '');
}

export function writeValueByVariableTargetFieldHandler(
  ctx: any,
  field: VariablePickerTargetField,
  value: string,
): void {
  const property = VARIABLE_TARGET_PROPERTY_MAP[field];
  ctx[property] = value;
  if (field === 'httpUrl' || field === 'httpBody' || field === 'httpResponse') {
    ctx.clearHttpTestFeedback();
  }
}
