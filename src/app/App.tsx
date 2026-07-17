import React, { useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Toolbar } from '../ui/toolbar/Toolbar';
import { PropertyPanel } from '../ui/panels/PropertyPanel';
import { CanvasPanel } from '../ui/panels/CanvasPanel';
import { ResultsPanel } from '../ui/tables/ResultsPanel';
import { HelpDialog } from '../ui/HelpDialog';
import { ModelGeneratorDialog } from '../ui/dialogs/ModelGeneratorDialog';
import { ModelTablePanel } from '../ui/tables/ModelTablePanel';
import { ImportSummaryDialog } from '../ui/dialogs/ImportSummaryDialog';
import { useProjectStore } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { useSelectionStore } from '../state/selectionStore';
import { useT, useI18nStore } from '../i18n';
import type {
  AnalyzeAllSuccess,
  AnyWorkerResponse,
  WorkerResponse,
} from '../worker/protocol';
import type { ProjectFile } from '../core/model/types';
import { saveProject, loadProjectWithReport } from '../persistence/indexedDb';
import { redoProject, undoProject } from '../state/projectStore';
import { generatePortalFrameTemplate } from '../core/model/generators';
import {
  generateCsvReport,
  generateMarkdownReport,
  generatePrintableReportHtml,
} from '../io/reportExporter';
import type { ReportInput, ReportResultView } from '../io/reportExporter';
import {
  beginAnalysisRequest,
  clearActiveAnalysisRequest,
  completeAnalysisRequest,
  createAnalysisRequestGuard,
  getActiveAnalysisRequestId,
  invalidateAnalysisForModelChange,
} from './analysisRequestGuard';

export const App: React.FC = () => {
  const workerRef = useRef<Worker | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSequenceRef = useRef(0);
  const analysisRequestGuardRef = useRef(createAnalysisRequestGuard());
  const [helpOpen, setHelpOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [initialGenerator, setInitialGenerator] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);
  const [pendingImportText, setPendingImportText] = useState<string | null>(null);

  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const theme = useViewStore((s) => s.theme);
  const toggleTheme = useViewStore((s) => s.toggleTheme);

  const model = useProjectStore((s) => s.model);
  const analysisResult = useProjectStore((s) => s.analysisResult);
  const analysisResults = useProjectStore((s) => s.analysisResults);
  const analysisEnvelope = useProjectStore((s) => s.analysisEnvelope);
  const analysisResultView = useProjectStore((s) => s.analysisResultView);
  const analysisError = useProjectStore((s) => s.analysisError);
  const isResultStale = useProjectStore((s) => s.isResultStale);
  const setAnalyzing = useProjectStore((s) => s.setAnalyzing);
  const setAnalysisResult = useProjectStore((s) => s.setAnalysisResult);
  const isAnalyzing = useProjectStore((s) => s.isAnalyzing);
  const loadModel = useProjectStore((s) => s.loadModel);
  const importJsonAuto = useProjectStore((s) => s.importJsonAuto);
  const importFrameJson = useProjectStore((s) => s.importFrameJson);
  const lastImportReport = useProjectStore((s) => s.lastImportReport);
  const clearImportReport = useProjectStore((s) => s.clearImportReport);
  const setImportReport = useProjectStore((s) => s.setImportReport);
  const resetModel = useProjectStore((s) => s.resetModel);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Auto-save with debounce
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveProject(model).catch(() => {/* ignore save errors */});
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [model]);

  // Invalidate synchronously with every model replacement/edit. This prevents
  // a late worker response from being attached to a newer model, including
  // reset/import and edit-then-undo sequences.
  useLayoutEffect(() => useProjectStore.subscribe((state, previousState) => {
    if (state.model === previousState.model) return;
    const requestId = invalidateAnalysisForModelChange(analysisRequestGuardRef.current);
    if (!requestId) return;
    workerRef.current?.terminate();
    workerRef.current = null;
    setAnalyzing(false);
  }), [setAnalyzing]);

  // Load saved project on startup
  useEffect(() => {
    loadProjectWithReport().then((saved) => {
      if (saved) {
        loadModel(saved.model);
        if (saved.warnings.length > 0) setImportReport(saved);
      }
      else {
        setInitialGenerator(true);
        setGeneratorOpen(true);
      }
    }).catch(() => {
      setInitialGenerator(true);
      setGeneratorOpen(true);
    });
  }, [loadModel, setImportReport]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    clearActiveAnalysisRequest(analysisRequestGuardRef.current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redoProject();
      else undoProject();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const runAnalysis = useCallback(() => {
    if (useProjectStore.getState().isAnalyzing) return;

    if (!workerRef.current) {
      const worker = new Worker(
        new URL('../worker/analysis.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<AnyWorkerResponse>) => {
        const response = e.data;
        // App requests always use the correlated v2 protocol. Never accept an
        // uncorrelated legacy response or a response from a replaced worker.
        if (!('requestId' in response) || workerRef.current !== worker) return;
        if (!completeAnalysisRequest(analysisRequestGuardRef.current, response.requestId)) return;
        if (response.type === 'analyze-canceled') {
          setAnalyzing(false);
          return;
        }
        if (response.type === 'analyze-success') {
          const elementEndForces = Object.fromEntries(Object.entries(response.elementEndForces).map(([id, values]) => [id, Array.from(values)]));
          setAnalysisResult({ ...response, displacements: Array.from(response.displacements), reactions: Array.from(response.reactions), elementEndForces } satisfies WorkerResponse);
          return;
        }
        if (response.type === 'analyze-all-success') {
          setAnalysisResult(normalizeAnalyzeAllResponse(response));
          return;
        }
        setAnalysisResult({ type: 'analyze-error', error: response.error });
      };
      worker.onerror = () => {
        if (workerRef.current !== worker) return;
        const requestId = getActiveAnalysisRequestId(analysisRequestGuardRef.current);
        if (!requestId || !completeAnalysisRequest(analysisRequestGuardRef.current, requestId)) return;
        worker.terminate();
        workerRef.current = null;
        setAnalysisResult({
          type: 'analyze-error',
          error: { type: 'numerical', message: t('app.workerCrash') },
        });
      };
    }

    setAnalyzing(true);
    const requestId = `analysis-${Date.now()}-${++requestSequenceRef.current}`;
    beginAnalysisRequest(analysisRequestGuardRef.current, requestId);
    workerRef.current.postMessage({
      type: 'analyze-all',
      requestId,
      model: useProjectStore.getState().model,
    });
  }, [setAnalyzing, setAnalysisResult, t]);

  const cancelAnalysis = useCallback(() => {
    const requestId = clearActiveAnalysisRequest(analysisRequestGuardRef.current);
    if (requestId) workerRef.current?.postMessage({ type: 'cancel', requestId });
    workerRef.current?.terminate();
    workerRef.current = null;
    setAnalyzing(false);
  }, [setAnalyzing]);

  const handleExport = useCallback(() => {
    const file: ProjectFile = {
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      model,
    };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frame-model-3d.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [model]);

  const reportInput = useCallback((): ReportInput => {
    let resultView: ReportResultView | undefined;
    if (analysisResultView?.kind === 'target') {
      const selected = analysisResults.find((item) => item.target.id === analysisResultView.targetId);
      if (selected) resultView = { kind: 'target', target: selected.target };
    } else if (analysisResultView?.kind === 'envelope' && analysisEnvelope) {
      resultView = {
        kind: 'envelope',
        bound: analysisResultView.bound,
        envelope: analysisEnvelope,
        targetNames: Object.fromEntries(
          analysisResults.map((item) => [item.target.id, item.target.name]),
        ),
      };
    }
    return {
      model,
      result: analysisResult,
      ...(resultView ? { resultView } : {}),
      error: analysisError,
      generatedAt: new Date(),
      isResultStale,
    };
  }, [model, analysisResult, analysisResults, analysisEnvelope, analysisResultView, analysisError, isResultStale]);

  const handleExportMarkdownReport = useCallback(() => {
    if (isResultStale) { alert(t('prop.staleWarning')); return; }
    downloadText('frame-analysis-report.md', generateMarkdownReport(reportInput()), 'text/markdown');
  }, [isResultStale, reportInput, t]);

  const handleExportCsvReport = useCallback(() => {
    if (isResultStale) { alert(t('prop.staleWarning')); return; }
    downloadText('frame-analysis-report.csv', generateCsvReport(reportInput()), 'text/csv');
  }, [isResultStale, reportInput, t]);

  const handlePrintReport = useCallback(async () => {
    if (isResultStale) { alert(t('prop.staleWarning')); return; }
    const viewportImageDataUrl = await captureViewerImage();
    const html = generatePrintableReportHtml({
      ...reportInput(),
      ...(viewportImageDataUrl ? { viewportImageDataUrl } : {}),
    });
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      URL.revokeObjectURL(url);
      alert(t('app.popupBlocked'));
      return;
    }
    let revoked = false;
    const revokeUrl = () => {
      if (revoked) return;
      URL.revokeObjectURL(url);
      revoked = true;
    };
    win.addEventListener('load', () => {
      win.print();
      revokeUrl();
    }, { once: true });
    win.addEventListener('beforeunload', revokeUrl, { once: true });
  }, [isResultStale, reportInput, t]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          clearSelection();
          const text = reader.result as string;
          setPendingImportText(text);
          importJsonAuto(text);
        } catch {
          alert(t('app.importError'));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [importJsonAuto, t, clearSelection]);

  const handleLoadSample = useCallback(async () => {
    try {
      // Try to load the FrameJson sample
      const resp = await fetch('./samples/FrameModel_Sample.json');
      if (resp.ok) {
        const text = await resp.text();
        clearSelection();
        setPendingImportText(text);
        importJsonAuto(text);
        return;
      }
    } catch {
      // fallback
    }
    clearSelection();
    loadModel(generatePortalFrameTemplate());
  }, [loadModel, importJsonAuto, clearSelection]);

  return (
    <div className="app-layout">
      <div className="top-bar">
        <span className="app-title">{t('app.title')}</span>
        <div className="top-actions">
          <button onClick={handleLoadSample}>{t('app.loadSample')}</button>
          <button onClick={handleImport}>{t('app.import')}</button>
          <button onClick={handleExport}>{t('app.export')}</button>
          <button onClick={handleExportMarkdownReport}>{t('app.reportMd')}</button>
          <button onClick={handleExportCsvReport}>{t('app.reportCsv')}</button>
          <button onClick={() => void handlePrintReport()}>{t('app.reportPdf')}</button>
          <button onClick={() => window.dispatchEvent(new Event('frame-viewer:screenshot'))}>{t('app.reportPng')}</button>
          <button onClick={() => { clearSelection(); resetModel(); setInitialGenerator(true); setGeneratorOpen(true); }}>{t('app.new')}</button>
          <button className="top-icon-btn" onClick={toggleTheme} title={theme === 'dark' ? t('theme.light') : t('theme.dark')}>
            {theme === 'dark' ? '\u2600' : '\u263E'}
          </button>
          <button className="top-icon-btn" onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')} title={t('app.language')}>
            {lang === 'ja' ? 'EN' : 'JA'}
          </button>
          <button className="top-icon-btn" onClick={() => setHelpOpen(true)} title={t('app.help')}>
            ?
          </button>
        </div>
      </div>
      <div className="main-area">
        <Toolbar onRunAnalysis={runAnalysis} onCancelAnalysis={cancelAnalysis} isAnalyzing={isAnalyzing} onOpenGenerator={() => { setInitialGenerator(false); setGeneratorOpen(true); }} onOpenTables={() => setTablesOpen(true)} />
        <div className="center-area">
          <CanvasPanel />
          <ResultsPanel />
        </div>
        <PropertyPanel />
      </div>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ModelGeneratorDialog open={generatorOpen} initial={initialGenerator} onClose={() => { setGeneratorOpen(false); setInitialGenerator(false); }} />
      <ModelTablePanel open={tablesOpen} onClose={() => setTablesOpen(false)} />
      <ImportSummaryDialog
        report={lastImportReport}
        {...(pendingImportText ? { onSelectLoadCase: (index: number) => { importFrameJson(pendingImportText, index); } } : {})}
        onClose={() => { clearImportReport(); setPendingImportText(null); }}
      />
    </div>
  );
};

function downloadText(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function captureViewerImage(): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    window.dispatchEvent(new CustomEvent('frame-viewer:capture-request', {
      detail: { resolve: finish },
    }));
    window.setTimeout(() => finish(''), 150);
  });
}

function normalizeAnalyzeAllResponse(
  response: Extract<AnyWorkerResponse, { type: 'analyze-all-success' }>,
): AnalyzeAllSuccess {
  const component = (
    value: typeof response.envelope.displacements,
  ): AnalyzeAllSuccess['envelope']['displacements'] => ({
    min: Array.from(value.min),
    max: Array.from(value.max),
    minTargetIds: value.minTargetIds,
    maxTargetIds: value.maxTargetIds,
  });
  return {
    type: 'analyze-all-success',
    results: response.results.map((result) => ({
      target: result.target,
      displacements: Array.from(result.displacements),
      reactions: Array.from(result.reactions),
      elementEndForces: Object.fromEntries(
        Object.entries(result.elementEndForces).map(([memberId, values]) => [memberId, Array.from(values)]),
      ),
      diagrams: result.diagrams,
      warnings: result.warnings,
    })),
    envelope: {
      displacements: component(response.envelope.displacements),
      reactions: component(response.envelope.reactions),
      elementEndForces: Object.fromEntries(
        Object.entries(response.envelope.elementEndForces).map(([memberId, value]) => [memberId, component(value)]),
      ),
    },
    factorizationCount: response.factorizationCount,
  };
}
