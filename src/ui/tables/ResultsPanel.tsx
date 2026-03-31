import React, { useState } from 'react';
import { useProjectStore } from '../../state/projectStore';

type TabId = 'displacements' | 'reactions' | 'endForces';

export const ResultsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('displacements');
  const model = useProjectStore((s) => s.model);
  const result = useProjectStore((s) => s.analysisResult);
  const error = useProjectStore((s) => s.analysisError);
  const isAnalyzing = useProjectStore((s) => s.isAnalyzing);
  const isResultStale = useProjectStore((s) => s.isResultStale);

  if (isAnalyzing) {
    return <div className="results-panel"><p>解析中...</p></div>;
  }

  if (error) {
    return (
      <div className="results-panel">
        <div className="error-text">{error.message}</div>
      </div>
    );
  }

  if (!result) {
    return <div className="results-panel"><p className="muted">解析結果がありません</p></div>;
  }

  return (
    <div className="results-panel">
      {isResultStale && <div className="warning-text">結果が古くなっています（モデル変更後未更新）</div>}
      <div className="tab-bar">
        <button className={activeTab === 'displacements' ? 'active' : ''} onClick={() => setActiveTab('displacements')}>節点変位</button>
        <button className={activeTab === 'reactions' ? 'active' : ''} onClick={() => setActiveTab('reactions')}>反力</button>
        <button className={activeTab === 'endForces' ? 'active' : ''} onClick={() => setActiveTab('endForces')}>部材端力</button>
      </div>

      {activeTab === 'displacements' && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>節点</th><th>ux</th><th>uy</th><th>rz</th></tr>
            </thead>
            <tbody>
              {model.nodes.map((n, i) => (
                <tr key={n.id}>
                  <td>N{i}</td>
                  <td>{fmt(result.displacements[i * 3])}</td>
                  <td>{fmt(result.displacements[i * 3 + 1])}</td>
                  <td>{fmt(result.displacements[i * 3 + 2])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'reactions' && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>節点</th><th>Rx</th><th>Ry</th><th>Mz</th></tr>
            </thead>
            <tbody>
              {model.nodes
                .map((n, i) => ({ n, i }))
                .filter(({ n }) => n.restraint.ux || n.restraint.uy || n.restraint.rz)
                .map(({ n, i }) => (
                  <tr key={n.id}>
                    <td>N{i}</td>
                    <td>{n.restraint.ux ? fmt(result.reactions[i * 3]) : '-'}</td>
                    <td>{n.restraint.uy ? fmt(result.reactions[i * 3 + 1]) : '-'}</td>
                    <td>{n.restraint.rz ? fmt(result.reactions[i * 3 + 2]) : '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'endForces' && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>部材</th><th>Ni</th><th>Vi</th><th>Mi</th><th>Nj</th><th>Vj</th><th>Mj</th></tr>
            </thead>
            <tbody>
              {model.members.map((m, idx) => {
                const ef = result.elementEndForces[m.id];
                if (!ef) return null;
                return (
                  <tr key={m.id}>
                    <td>M{idx}</td>
                    <td>{fmt(ef[0])}</td>
                    <td>{fmt(ef[1])}</td>
                    <td>{fmt(ef[2])}</td>
                    <td>{fmt(ef[3])}</td>
                    <td>{fmt(ef[4])}</td>
                    <td>{fmt(ef[5])}</td>
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

function fmt(v: number | undefined): string {
  if (v === undefined) return '-';
  if (Math.abs(v) < 1e-10) return '0.000';
  if (Math.abs(v) >= 1e4 || Math.abs(v) < 1e-3) return v.toExponential(3);
  return v.toFixed(4);
}
