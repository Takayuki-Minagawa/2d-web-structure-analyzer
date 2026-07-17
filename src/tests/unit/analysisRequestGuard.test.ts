import { describe, expect, it } from 'vitest';
import {
  beginAnalysisRequest,
  clearActiveAnalysisRequest,
  completeAnalysisRequest,
  createAnalysisRequestGuard,
  getActiveAnalysisRequestId,
  invalidateAnalysisForModelChange,
} from '../../app/analysisRequestGuard';

describe('analysis request guard', () => {
  it('accepts the current response exactly once', () => {
    const guard = createAnalysisRequestGuard();
    beginAnalysisRequest(guard, 'request-1');

    expect(completeAnalysisRequest(guard, 'request-1')).toBe(true);
    expect(completeAnalysisRequest(guard, 'request-1')).toBe(false);
  });

  it('rejects a response after the model changes', () => {
    const guard = createAnalysisRequestGuard();
    beginAnalysisRequest(guard, 'old-model');

    expect(invalidateAnalysisForModelChange(guard)).toBe('old-model');
    expect(completeAnalysisRequest(guard, 'old-model')).toBe(false);
  });

  it('does not revive an old response after another request starts', () => {
    const guard = createAnalysisRequestGuard();
    beginAnalysisRequest(guard, 'old-model');
    invalidateAnalysisForModelChange(guard);
    beginAnalysisRequest(guard, 'new-model');

    expect(completeAnalysisRequest(guard, 'old-model')).toBe(false);
    expect(completeAnalysisRequest(guard, 'new-model')).toBe(true);
  });

  it('rejects the old response even when a later undo restores prior model data', () => {
    const guard = createAnalysisRequestGuard();
    beginAnalysisRequest(guard, 'before-edit');

    invalidateAnalysisForModelChange(guard); // edit
    invalidateAnalysisForModelChange(guard); // undo

    expect(guard.modelRevision).toBe(2);
    expect(completeAnalysisRequest(guard, 'before-edit')).toBe(false);
  });

  it('clears a canceled request without changing the model revision', () => {
    const guard = createAnalysisRequestGuard();
    beginAnalysisRequest(guard, 'request-1');

    expect(getActiveAnalysisRequestId(guard)).toBe('request-1');
    expect(clearActiveAnalysisRequest(guard)).toBe('request-1');
    expect(getActiveAnalysisRequestId(guard)).toBeNull();
    expect(guard.modelRevision).toBe(0);
  });
});
