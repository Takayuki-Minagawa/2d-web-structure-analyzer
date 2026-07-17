/**
 * Tracks the model generation associated with an in-flight analysis request.
 *
 * Request ids alone are insufficient: a worker may finish after the user has
 * edited, reset, or imported a model without starting another analysis.  The
 * monotonically increasing model revision makes such responses permanently
 * ineligible, even if undo later restores the exact same model object.
 */
export interface AnalysisRequestGuard {
  modelRevision: number;
  active: {
    requestId: string;
    modelRevision: number;
  } | null;
}

export function createAnalysisRequestGuard(): AnalysisRequestGuard {
  return { modelRevision: 0, active: null };
}

export function beginAnalysisRequest(
  guard: AnalysisRequestGuard,
  requestId: string,
): void {
  guard.active = { requestId, modelRevision: guard.modelRevision };
}

/** Invalidates any active request and returns its id for optional cancellation. */
export function invalidateAnalysisForModelChange(
  guard: AnalysisRequestGuard,
): string | null {
  guard.modelRevision += 1;
  const requestId = guard.active?.requestId ?? null;
  guard.active = null;
  return requestId;
}

/**
 * Atomically accepts and completes a response only when both its request id
 * and the model revision still match the active request.
 */
export function completeAnalysisRequest(
  guard: AnalysisRequestGuard,
  requestId: string,
): boolean {
  const active = guard.active;
  if (
    !active
    || active.requestId !== requestId
    || active.modelRevision !== guard.modelRevision
  ) {
    return false;
  }
  guard.active = null;
  return true;
}

export function clearActiveAnalysisRequest(
  guard: AnalysisRequestGuard,
): string | null {
  const requestId = guard.active?.requestId ?? null;
  guard.active = null;
  return requestId;
}

export function getActiveAnalysisRequestId(
  guard: AnalysisRequestGuard,
): string | null {
  return guard.active?.requestId ?? null;
}
