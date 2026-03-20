export function parseConditionInputValue(valueText: string): unknown {
  const trimmed = valueText.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (trimmed === 'null') {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    return Number.isNaN(asNumber) ? trimmed : asNumber;
  }

  return valueText;
}

export function parseConfigObject(configRaw: string): Record<string, unknown> {
  if (!configRaw) {
    return {};
  }

  try {
    const parsed = JSON.parse(configRaw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
