import { HttpErrorResponse } from '@angular/common/http';
import { WorkflowHttpTestResponse } from '@/app/core/services/workflow/workflow.service';
import {
  extractHttpTestBackendErrorMessage,
  formatHttpTestResponse,
  resolveHttpTestErrorTypeLabel,
} from './workflow-runtime.utils';

export type WorkflowHttpFeedbackState = {
  httpTestSeverity: 'success' | 'info' | 'warn' | 'error';
  httpTestSummary: string;
  httpTestMeta: string;
  httpTestDetail: string;
  httpTestResponseJson: string;
};

export function clearHttpTestFeedbackState(): WorkflowHttpFeedbackState {
  return {
    httpTestSeverity: 'info',
    httpTestSummary: '',
    httpTestMeta: '',
    httpTestDetail: '',
    httpTestResponseJson: '',
  };
}

export function buildHttpTestFeedbackFromResult(
  result: WorkflowHttpTestResponse,
): WorkflowHttpFeedbackState {
  const responsePreview = formatHttpTestResponse(result.responsePreview);
  const baseState: WorkflowHttpFeedbackState = {
    ...clearHttpTestFeedbackState(),
    httpTestMeta: `${result.method} ${result.url} | ${result.durationMs} ms`,
    httpTestResponseJson: responsePreview,
  };

  if (result.success) {
    return {
      ...baseState,
      httpTestSeverity: 'success',
      httpTestSummary:
        `Peticion exitosa: HTTP ${result.status ?? ''} ${result.statusText ?? ''}`.trim(),
      httpTestDetail: responsePreview
        ? 'Respuesta recibida:'
        : 'La respuesta no devolvio contenido.',
    };
  }

  const statusLabel =
    result.status !== null
      ? `HTTP ${result.status}${result.statusText ? ` ${result.statusText}` : ''}`
      : 'Sin respuesta HTTP';

  const detailParts = [
    result.errorMessage?.trim() ?? '',
    responsePreview ? 'Respuesta del servidor:' : '',
  ].filter(Boolean);

  return {
    ...baseState,
    httpTestSeverity: 'error',
    httpTestSummary: `Error ${resolveHttpTestErrorTypeLabel(result.errorType)}: ${statusLabel}`,
    httpTestDetail: detailParts.join(' | '),
  };
}

export function buildHttpTestFeedbackFromTransportError(
  error: unknown,
): WorkflowHttpFeedbackState {
  const baseState = clearHttpTestFeedbackState();
  baseState.httpTestSeverity = 'error';
  baseState.httpTestSummary = 'No se pudo ejecutar la prueba HTTP.';

  if (error instanceof HttpErrorResponse) {
    const backendErrorMessage = extractHttpTestBackendErrorMessage(error.error);
    baseState.httpTestDetail =
      backendErrorMessage ||
      `Error ${error.status || 'de red'}: ${error.statusText || 'sin detalle'}`;
    return baseState;
  }

  if (error instanceof Error && error.message.trim()) {
    baseState.httpTestDetail = error.message.trim();
    return baseState;
  }

  baseState.httpTestDetail = 'Error inesperado al probar la peticion HTTP.';
  return baseState;
}
