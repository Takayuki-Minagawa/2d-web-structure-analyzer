import React, { useState, useMemo } from 'react';
import { useProjectStore } from '../../state/projectStore';
import type { AnalysisResultView } from '../../state/projectStore';
import { useT } from '../../i18n';
import type { TKey } from '../../i18n';
import type {
  AnalysisError,
  AnalysisResult,
  DofName,
  ProjectModel,
  ReleasedMemberMode,
  StabilityDiagnostic,
} from '../../core/model/types';
import { buildEffectiveReactionRows } from './reactionRows';
import { memberLabel, nodeLabel } from '../../core/model/displayNumbers';
import { formatEngineering } from '../../core/formatEngineering';
import { useSelectionStore } from '../../state/selectionStore';
import type { SerializedComponentEnvelope } from '../../worker/protocol';

type TabId = 'displacements' | 'reactions' | 'endForces';
type Translate = (key: TKey) => string;

const DOF_LABEL_KEYS: Record<DofName, TKey> = {
  ux: 'results.dof.ux',
  uy: 'results.dof.uy',
  uz: 'results.dof.uz',
  rx: 'results.dof.rx',
  ry: 'results.dof.ry',
  rz: 'results.dof.rz',
};

const RELEASE_LABEL_KEYS: Record<ReleasedMemberMode, TKey> = {
  localXTwist: 'results.release.localXTwist',
  localYBending: 'results.release.localYBending',
  localZBending: 'results.release.localZBending',
};

export const ResultsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('displacements');
  const model = useProjectStore((s) => s.model);
  const result = useProjectStore((s) => s.analysisResult);
  const analysisResults = useProjectStore((s) => s.analysisResults);
  const analysisEnvelope = useProjectStore((s) => s.analysisEnvelope);
  const analysisFactorizationCount = useProjectStore((s) => s.analysisFactorizationCount);
  const analysisResultView = useProjectStore((s) => s.analysisResultView);
  const selectAnalysisResultView = useProjectStore((s) => s.selectAnalysisResultView);
  const error = useProjectStore((s) => s.analysisError);
  const isAnalyzing = useProjectStore((s) => s.isAnalyzing);
  const isResultStale = useProjectStore((s) => s.isResultStale);
  const t = useT();
  const targetNames = useMemo(
    () => new Map(analysisResults.map((item) => [item.target.id, item.target.name])),
    [analysisResults],
  );
  const envelopeBound = analysisResultView?.kind === 'envelope'
    ? analysisResultView.bound
    : null;
  const resultViewValue = analysisResultView?.kind === 'target'
    ? `target:${analysisResultView.targetId}`
    : analysisResultView?.kind === 'envelope'
      ? `envelope:${analysisResultView.bound}`
      : '';

  const changeResultView = (value: string) => {
    const targetId = value.startsWith('target:') ? value.slice('target:'.length) : '';
    const envelopeBoundValue = value.startsWith('envelope:')
      ? value.slice('envelope:'.length)
      : '';
    const view: AnalysisResultView | null = targetId
      ? { kind: 'target', targetId }
      : envelopeBoundValue === 'min' || envelopeBoundValue === 'max'
        ? { kind: 'envelope', bound: envelopeBoundValue }
        : null;
    if (view) selectAnalysisResultView(view);
  };

  if (isAnalyzing) {
    return <div className="results-panel"><p>{t('results.analyzing')}</p></div>;
  }

  if (error) {
    return (
      <div className="results-panel">
        <AnalysisErrorDetails error={error} model={model} />
      </div>
    );
  }

  if (!result) {
    return <div className="results-panel"><p className="muted">{t('results.noResults')}</p></div>;
  }

  if (isResultStale) {
    return <div className="results-panel"><p className="warning-text">{t('results.stale')}</p><p className="muted">{t('results.staleHidden')}</p></div>;
  }

  return (
    <div className="results-panel">
      {analysisResults.length > 0 && (
        <div className="result-view-controls">
          <label>
            {t('results.resultView')}
            <select value={resultViewValue} onChange={(event) => changeResultView(event.target.value)}>
              <optgroup label={t('results.casesCombinations')}>
                {analysisResults.map((item) => <option key={`${item.target.type}:${item.target.id}`} value={`target:${item.target.id}`}>{item.target.type === 'loadCase' ? t('results.casePrefix') : t('results.combinationPrefix')}: {item.target.name}</option>)}
              </optgroup>
              {analysisEnvelope && <optgroup label={t('results.envelope')}><option value="envelope:min">{t('results.minimum')}</option><option value="envelope:max">{t('results.maximum')}</option></optgroup>}
            </select>
          </label>
          {analysisFactorizationCount !== null && <span className="result-factorization">{t('results.factorizationCount').replace('{count}', String(analysisFactorizationCount))}</span>}
        </div>
      )}
      <div className="tab-bar">
        <button className={activeTab === 'displacements' ? 'active' : ''} onClick={() => setActiveTab('displacements')}>{t('results.displacements')}</button>
        <button className={activeTab === 'reactions' ? 'active' : ''} onClick={() => setActiveTab('reactions')}>{t('results.reactions')}</button>
        <button className={activeTab === 'endForces' ? 'active' : ''} onClick={() => setActiveTab('endForces')}>{t('results.endForces')}</button>
      </div>

      {activeTab === 'displacements' && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>{t('results.node')}</th><th>ux</th><th>uy</th><th>uz</th><th>rx</th><th>ry</th><th>rz</th></tr>
            </thead>
            <tbody>
              {model.nodes.map((n, i) => (
                <tr key={n.id}>
                  <td>{nodeLabel(n)}</td>
                  {Array.from({ length: 6 }, (_, component) => envelopeBound && analysisEnvelope
                    ? <EnvelopeValueCell key={component} envelope={analysisEnvelope.displacements} index={i * 6 + component} bound={envelopeBound} targetNames={targetNames} governingTemplate={t('results.governing')} />
                    : <td key={component}>{fmt(result.displacements[i * 6 + component])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'reactions' && (
        envelopeBound && analysisEnvelope
          ? <EnvelopeNodeTable model={model} envelope={analysisEnvelope.reactions} bound={envelopeBound} targetNames={targetNames} labels={['Rx', 'Ry', 'Rz', 'Mx', 'My', 'Mz']} governingTemplate={t('results.governing')} />
          : <ReactionTable model={model} result={result} />
      )}

      {activeTab === 'endForces' && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>{t('results.member')}</th>
                <th>Ni</th><th>Vyi</th><th>Vzi</th><th>Mxi</th><th>Myi</th><th>Mzi</th>
                <th>Nj</th><th>Vyj</th><th>Vzj</th><th>Mxj</th><th>Myj</th><th>Mzj</th>
              </tr>
            </thead>
            <tbody>
              {model.members.map((m) => {
                const ef = result.elementEndForces[m.id];
                const envelope = analysisEnvelope?.elementEndForces[m.id];
                if (envelopeBound ? !envelope : !ef) return null;
                return (
                  <tr key={m.id}>
                    <td>{memberLabel(m)}</td>
                    {Array.from({ length: 12 }, (_, k) => (
                      envelopeBound && envelope
                        ? <EnvelopeValueCell key={k} envelope={envelope} index={k} bound={envelopeBound} targetNames={targetNames} governingTemplate={t('results.governing')} />
                        : <td key={k}>{fmt(ef?.[k])}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!envelopeBound && result.warnings.length > 0 && (
        <div className="warnings">
          {result.warnings.map((w, i) => (
            <div key={i} className="warning-text">{w}</div>
          ))}
        </div>
      )}
    </div>
  );
};

const AnalysisErrorDetails: React.FC<{ error: AnalysisError; model: ProjectModel }> = ({ error, model }) => {
  const t = useT();
  const selectNode = useSelectionStore((state) => state.selectNode);
  const selectMember = useSelectionStore((state) => state.selectMember);
  const focusSelection = useSelectionStore((state) => state.focusSelection);
  const diagnostics = error.diagnostics ?? [];
  const hasNodeTarget = Boolean(error.nodeId && model.nodes.some((node) => node.id === error.nodeId));
  const hasMemberTarget = Boolean(error.elementId && model.members.some((member) => member.id === error.elementId));
  const goToError = () => {
    if (hasNodeTarget && error.nodeId) selectNode(error.nodeId);
    else if (hasMemberTarget && error.elementId) selectMember(error.elementId);
    else return;
    focusSelection();
  };

  return (
    <div className="analysis-error">
      {hasNodeTarget || hasMemberTarget
        ? <button className="error-link error-text" onClick={goToError}>{formatAnalysisErrorMessage(error, t)}</button>
        : <div className="error-text">{formatAnalysisErrorMessage(error, t)}</div>}
      {diagnostics.length > 0 && (
        <div className="diagnostics-list">
          <div className="diagnostics-title">{t('results.diagnostics')}</div>
          {diagnostics.map((diagnostic, index) => (
            <DiagnosticItem key={`${diagnostic.kind}-${index}`} diagnostic={diagnostic} model={model} />
          ))}
        </div>
      )}
    </div>
  );
};

const DiagnosticItem: React.FC<{ diagnostic: StabilityDiagnostic; model: ProjectModel }> = ({ diagnostic, model }) => {
  const t = useT();
  const selectNode = useSelectionStore((state) => state.selectNode);
  const selectMember = useSelectionStore((state) => state.selectMember);
  const focusSelection = useSelectionStore((state) => state.focusSelection);
  const displayNodeId = diagnostic.nodeId ? nodeLabel(model.nodes.find((node) => node.id === diagnostic.nodeId)) : undefined;
  const displayMemberId = diagnostic.elementId ? memberLabel(model.members.find((member) => member.id === diagnostic.elementId)) : undefined;
  const formatted = formatDiagnostic({ ...diagnostic, ...(displayNodeId ? { nodeId: displayNodeId } : {}), ...(displayMemberId ? { elementId: displayMemberId } : {}) }, t);
  const meta = [
    displayNodeId ? `${t('results.node')} ${displayNodeId}` : null,
    displayMemberId ? `${t('results.member')} ${displayMemberId}` : null,
    diagnostic.dof ? `DOF ${diagnostic.dof}` : null,
  ].filter((item): item is string => item !== null);

  return (
    <button className="diagnostic-item diagnostic-button" onClick={() => { if (diagnostic.nodeId) selectNode(diagnostic.nodeId); else if (diagnostic.elementId) selectMember(diagnostic.elementId); else return; focusSelection(); }}>
      <div>{formatted.message}</div>
      {meta.length > 0 && <div className="diagnostic-meta">{meta.join(' / ')}</div>}
      <div className="diagnostic-suggestion">
        <span>{t('results.diagnosticSuggestion')}</span>
        {formatted.suggestion}
      </div>
    </button>
  );
};

function formatAnalysisErrorMessage(error: AnalysisError, t: Translate): string {
  if (error.type === 'singular') return t('results.error.singular');
  return error.message;
}

function formatDiagnostic(
  diagnostic: StabilityDiagnostic,
  t: Translate
): { message: string; suggestion: string } {
  if (diagnostic.kind === 'singular-pivot') {
    return {
      message: formatText(t, 'results.diagnostic.singularPivot.message', {
        nodeId: diagnostic.nodeId ?? '-',
        dofLabel: formatDofLabel(diagnostic.dof, t),
      }),
      suggestion: t('results.diagnostic.singularPivot.suggestion'),
    };
  }

  if (diagnostic.kind === 'zero-stiffness-dof') {
    return {
      message: formatText(t, 'results.diagnostic.zeroStiffness.message', {
        nodeId: diagnostic.nodeId ?? '-',
        dofLabel: formatDofLabel(diagnostic.dof, t),
      }),
      suggestion: t('results.diagnostic.zeroStiffness.suggestion'),
    };
  }

  return {
    message: formatText(t, 'results.diagnostic.releasedMember.message', {
      memberId: diagnostic.elementId ?? '-',
      releasedModes: formatReleasedModes(diagnostic, t),
    }),
    suggestion: t('results.diagnostic.releasedMember.suggestion'),
  };
}

function formatText(
  t: Translate,
  key: TKey,
  values: Record<string, string>
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(value),
    t(key)
  );
}

function formatDofLabel(dof: StabilityDiagnostic['dof'], t: Translate): string {
  if (!dof) return '-';
  return t(DOF_LABEL_KEYS[dof]);
}

function formatReleasedModes(diagnostic: StabilityDiagnostic, t: Translate): string {
  const released = diagnostic.released ?? [];
  if (released.length === 0) return '-';
  const separator = t('results.listSeparator');
  return released.map((mode) => t(RELEASE_LABEL_KEYS[mode])).join(separator);
}

function useEffectiveReactions(model: ProjectModel, reactions: number[]) {
  return useMemo(
    () => buildEffectiveReactionRows(model, reactions),
    [model, reactions]
  );
}

const EnvelopeValueCell: React.FC<{
  envelope: SerializedComponentEnvelope<number[]>;
  index: number;
  bound: 'min' | 'max';
  targetNames: ReadonlyMap<string, string>;
  governingTemplate: string;
}> = ({ envelope, index, bound, targetNames, governingTemplate }) => {
  const values = bound === 'min' ? envelope.min : envelope.max;
  const targetIds = bound === 'min' ? envelope.minTargetIds : envelope.maxTargetIds;
  const targetId = targetIds[index];
  const targetName = targetId ? targetNames.get(targetId) ?? targetId : '';
  return <td title={targetName ? governingTemplate.replace('{target}', targetName) : undefined}>
    <span>{fmt(values[index])}</span>
    {targetName && <small className="envelope-target">{targetName}</small>}
  </td>;
};

const EnvelopeNodeTable: React.FC<{
  model: ProjectModel;
  envelope: SerializedComponentEnvelope<number[]>;
  bound: 'min' | 'max';
  targetNames: ReadonlyMap<string, string>;
  labels: readonly string[];
  governingTemplate: string;
}> = ({ model, envelope, bound, targetNames, labels, governingTemplate }) => {
  const t = useT();
  return <div className="table-wrapper">
    <table>
      <thead><tr><th>{t('results.node')}</th>{labels.map((label) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{model.nodes.map((node, nodeIndex) => <tr key={node.id}>
        <td>{nodeLabel(node)}</td>
        {labels.map((label, component) => <EnvelopeValueCell key={label} envelope={envelope} index={nodeIndex * 6 + component} bound={bound} targetNames={targetNames} governingTemplate={governingTemplate} />)}
      </tr>)}</tbody>
    </table>
  </div>;
};

const ReactionTable: React.FC<{
  model: ProjectModel;
  result: AnalysisResult;
}> = ({ model, result }) => {
  const t = useT();
  const { rows, hasSharedReactions, hasInvalidCouplings } = useEffectiveReactions(model, result.reactions);
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr><th>{t('results.node')}</th><th>Rx</th><th>Ry</th><th>Rz</th><th>Mx</th><th>My</th><th>Mz</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.nodeId}>
              <td>{nodeLabel(nodeById.get(row.nodeId))}</td>
              {row.cells.map((cell, k) => (
                <td key={k}>
                  {cell.value !== null
                    ? `${fmt(cell.value)}${cell.isShared ? '*' : ''}`
                    : cell.isShared
                      ? t('results.coupledShared')
                      : '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hasInvalidCouplings && (
        <div className="warning-text">{t('results.invalidCouplingReactionFallback')}</div>
      )}
      {hasSharedReactions && (
        <div className="warning-text">{t('results.coupledReactionNote')}</div>
      )}
    </div>
  );
};

function fmt(v: number | undefined): string {
  if (v === undefined) return '-';
  return formatEngineering(v, { significantDigits: 5, zeroTolerance: 1e-10 });
}
