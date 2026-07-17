import type {
  AnalyzeCanceled,
  AnalysisExecutionRequestV2,
  AnyWorkerResponse,
  WorkerRequest,
} from './protocol';
import { isAnalyzeRequestV2 } from './protocol';
import { createAnalysisResponse } from './analysisRequestHandler';

type WorkerPostTarget = {
  postMessage(message: AnyWorkerResponse, transferables?: Transferable[]): void;
};

const workerTarget = self as unknown as WorkerPostTarget;
const pendingRequests = new Map<string, ReturnType<typeof setTimeout>>();

function postResponse(response: AnyWorkerResponse, transferables: Transferable[] = []): void {
  workerTarget.postMessage(response, transferables);
}

function runRequest(request: AnalysisExecutionRequestV2): void {
  pendingRequests.delete(request.requestId);
  const envelope = createAnalysisResponse(request);
  postResponse(envelope.response, envelope.transferables);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    const pending = pendingRequests.get(request.requestId);
    if (!pending) return;
    clearTimeout(pending);
    pendingRequests.delete(request.requestId);
    const response: AnalyzeCanceled = {
      type: 'analyze-canceled',
      requestId: request.requestId,
    };
    postResponse(response);
    return;
  }

  if (!isAnalyzeRequestV2(request)) {
    const envelope = createAnalysisResponse(request);
    postResponse(envelope.response, envelope.transferables);
    return;
  }

  // Deferring v2 work creates a cancellable queued state. Once the synchronous
  // numerical solve starts, clients that require hard cancellation should
  // terminate and recreate the worker.
  const existing = pendingRequests.get(request.requestId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => runRequest(request), 0);
  pendingRequests.set(request.requestId, timer);
};
