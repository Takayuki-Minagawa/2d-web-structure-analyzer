import React, { useState, useMemo } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useT } from '../../i18n';

type TabId = 'displacements' | 'reactions' | 'endForces';

export const ResultsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('displacements');
  const model = useProjectStore((s) => s.model);
  const result = useProjectStore((s) => s.analysisResult);
  const error = useProjectStore((s) => s.analysisError);
  const isAnalyzing = useProjectStore((s) => s.isAnalyzing);
  const isResultStale = useProjectStore((s) => s.isResultStale);
  const t = useT();

  if (isAnalyzing) {
    return <div className="results-panel"><p>{t('results.analyzing')}</p></div>;
  }

  if (error) {
    return (
      <div className="results-panel">
        <div className="error-text">{error.message}</div>
      </div>
    );
  }

  if (!result) {
    return <div className="results-panel"><p className="muted">{t('results.noResults')}</p></div>;
  }

  return (
    <div className="results-panel">
      {isResultStale && <div className="warning-text">{t('results.stale')}</div>}
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
                  <td>{n.id.substring(0, 5)}</td>
                  <td>{fmt(result.displacements[i * 6])}</td>
                  <td>{fmt(result.displacements[i * 6 + 1])}</td>
                  <td>{fmt(result.displacements[i * 6 + 2])}</td>
                  <td>{fmt(result.displacements[i * 6 + 3])}</td>
                  <td>{fmt(result.displacements[i * 6 + 4])}</td>
                  <td>{fmt(result.displacements[i * 6 + 5])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'reactions' && (
        <ReactionTable model={model} result={result} />
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
                if (!ef) return null;
                return (
                  <tr key={m.id}>
                    <td>{m.id.substring(0, 5)}</td>
                    {Array.from({ length: 12 }, (_, k) => (
                      <td key={k}>{fmt(ef[k])}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="warnings">
          {result.warnings.map((w, i) => (
            <div key={i} className="warning-text">{w}</div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Build effective constraint flags per node, accounting for coupling propagation.
 * For each slave DOF that is fixed, the reaction lives at the master DOF.
 * We return, for each node, which DOFs are constrained (including propagated)
 * and the actual reaction DOF index to read.
 */
function useEffectiveReactions(
  model: import('../../core/model/types').ProjectModel,
  reactions: number[]
) {
  return useMemo(() => {
    const nodeIdToIndex = new Map(model.nodes.map((n, i) => [n.id, i]));
    const dofLabels = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const;

    // Build DOF map (same logic as indexing.ts)
    const nodeCount = model.nodes.length;
    const dofMap = new Int32Array(nodeCount * 6);
    for (let i = 0; i < dofMap.length; i++) dofMap[i] = i;
    for (const c of model.couplings ?? []) {
      const mi = nodeIdToIndex.get(c.masterNodeId);
      const si = nodeIdToIndex.get(c.slaveNodeId);
      if (mi === undefined || si === undefined) continue;
      const flags = [c.ux, c.uy, c.uz, c.rx, c.ry, c.rz];
      for (let d = 0; d < 6; d++) {
        if (!flags[d]) continue;
        const slaveDof = si * 6 + d;
        let resolved = mi * 6 + d;
        while (dofMap[resolved] !== resolved) resolved = dofMap[resolved]!;
        dofMap[slaveDof] = resolved;
      }
    }

    // For each node, determine effective fixed DOFs and reaction values
    type Row = { nodeId: string; cells: (number | null)[] };
    const rows: Row[] = [];

    for (let i = 0; i < model.nodes.length; i++) {
      const n = model.nodes[i]!;
      const r = n.restraint;
      const flags = [r.ux, r.uy, r.uz, r.rx, r.ry, r.rz];

      // Also check if this node is a slave with fixed DOFs (reaction at master)
      let hasAny = false;
      const cells: (number | null)[] = [];
      for (let d = 0; d < 6; d++) {
        if (flags[d]) {
          // This DOF is constrained. The reaction is at the mapped DOF.
          const mappedDof = dofMap[i * 6 + d]!;
          cells.push(reactions[mappedDof] ?? 0);
          hasAny = true;
        } else {
          cells.push(null);
        }
      }
      if (hasAny) {
        rows.push({ nodeId: n.id, cells });
      }
    }

    return { rows, dofLabels };
  }, [model, reactions]);
}

const ReactionTable: React.FC<{
  model: import('../../core/model/types').ProjectModel;
  result: import('../../state/projectStore').AnalysisResult;
}> = ({ model, result }) => {
  const t = useT();
  const { rows } = useEffectiveReactions(model, result.reactions);

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr><th>{t('results.node')}</th><th>Rx</th><th>Ry</th><th>Rz</th><th>Mx</th><th>My</th><th>Mz</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.nodeId}>
              <td>{row.nodeId.substring(0, 5)}</td>
              {row.cells.map((v, k) => (
                <td key={k}>{v !== null ? fmt(v) : '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function fmt(v: number | undefined): string {
  if (v === undefined) return '-';
  if (Math.abs(v) < 1e-10) return '0.000';
  if (Math.abs(v) >= 1e4 || Math.abs(v) < 1e-3) return v.toExponential(3);
  return v.toFixed(4);
}
