import React, { useRef, useCallback, useEffect } from 'react';
import { Toolbar } from '../ui/toolbar/Toolbar';
import { PropertyPanel } from '../ui/panels/PropertyPanel';
import { CanvasPanel } from '../ui/panels/CanvasPanel';
import { ResultsPanel } from '../ui/tables/ResultsPanel';
import { useProjectStore } from '../state/projectStore';
import type { WorkerResponse } from '../worker/protocol';
import type { ProjectFile } from '../core/model/types';
import { saveProject, loadProject } from '../persistence/indexedDb';

export const App: React.FC = () => {
  const workerRef = useRef<Worker | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const model = useProjectStore((s) => s.model);
  const setAnalyzing = useProjectStore((s) => s.setAnalyzing);
  const setAnalysisResult = useProjectStore((s) => s.setAnalysisResult);
  const isAnalyzing = useProjectStore((s) => s.isAnalyzing);
  const loadModel = useProjectStore((s) => s.loadModel);
  const resetModel = useProjectStore((s) => s.resetModel);

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

  // Load saved project on startup
  useEffect(() => {
    loadProject().then((saved) => {
      if (saved) loadModel(saved);
    }).catch(() => {/* ignore load errors */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAnalysis = useCallback(() => {
    if (isAnalyzing) return;

    // Create worker lazily
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../worker/analysis.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
        setAnalysisResult(e.data);
      };
    }

    setAnalyzing(true);
    workerRef.current.postMessage({ type: 'analyze', model });
  }, [model, isAnalyzing, setAnalyzing, setAnalysisResult]);

  const handleExport = useCallback(() => {
    const file: ProjectFile = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      model,
    };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frame-model.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [model]);

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
          const data = JSON.parse(reader.result as string) as ProjectFile;
          if (data.model) {
            loadModel(data.model);
          }
        } catch {
          alert('JSONファイルの読み込みに失敗しました。');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [loadModel]);

  const handleLoadSample = useCallback(() => {
    const sampleModel = {
      nodes: [
        { id: 'n0', x: 0, y: 0, restraint: { ux: true, uy: true, rz: true } },
        { id: 'n1', x: 0, y: 4, restraint: { ux: false, uy: false, rz: false } },
        { id: 'n2', x: 6, y: 4, restraint: { ux: false, uy: false, rz: false } },
        { id: 'n3', x: 6, y: 0, restraint: { ux: true, uy: true, rz: false } },
      ],
      materials: [{ id: 'mat1', name: 'Steel', E: 205000 }],
      sections: [{ id: 'sec1', name: 'H-200x100', A: 0.0027, I: 1.84e-5 }],
      members: [
        { id: 'm1', ni: 'n0', nj: 'n1', materialId: 'mat1', sectionId: 'sec1' },
        { id: 'm2', ni: 'n1', nj: 'n2', materialId: 'mat1', sectionId: 'sec1' },
        { id: 'm3', ni: 'n3', nj: 'n2', materialId: 'mat1', sectionId: 'sec1' },
      ],
      nodalLoads: [
        { id: 'nl1', nodeId: 'n1', fx: 10, fy: 0, mz: 0 },
      ],
      memberLoads: [
        { id: 'ml1', memberId: 'm2', type: 'udl' as const, direction: 'localY' as const, value: -8 },
      ],
      units: { force: 'kN', length: 'm', moment: 'kN·m' },
    };
    loadModel(sampleModel);
  }, [loadModel]);

  return (
    <div className="app-layout">
      <div className="top-bar">
        <span className="app-title">2D Frame Analyzer</span>
        <div className="top-actions">
          <button onClick={handleLoadSample}>サンプル読込</button>
          <button onClick={handleImport}>JSON読込</button>
          <button onClick={handleExport}>JSON保存</button>
          <button onClick={resetModel}>新規</button>
        </div>
      </div>
      <div className="main-area">
        <Toolbar onRunAnalysis={runAnalysis} />
        <div className="center-area">
          <CanvasPanel />
          <ResultsPanel />
        </div>
        <PropertyPanel />
      </div>
    </div>
  );
};
