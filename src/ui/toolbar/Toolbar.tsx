import React from 'react';
import { useViewStore } from '../../state/viewStore';
import type { EditTool, DisplayMode } from '../../state/viewStore';

const tools: { id: EditTool; label: string; icon: string }[] = [
  { id: 'select', label: '選択', icon: '⊙' },
  { id: 'addNode', label: '節点', icon: '＋' },
  { id: 'addMember', label: '部材', icon: '─' },
  { id: 'setSupport', label: '支持', icon: '▽' },
  { id: 'addNodalLoad', label: '節点荷重', icon: '↓' },
  { id: 'addMemberLoad', label: '部材荷重', icon: '⇣' },
];

const displayModes: { id: DisplayMode; label: string }[] = [
  { id: 'model', label: 'モデル' },
  { id: 'deformation', label: '変形' },
  { id: 'axial', label: '軸力' },
  { id: 'shear', label: 'せん断' },
  { id: 'moment', label: 'モーメント' },
];

export const Toolbar: React.FC<{ onRunAnalysis: () => void }> = ({ onRunAnalysis }) => {
  const editTool = useViewStore((s) => s.editTool);
  const setEditTool = useViewStore((s) => s.setEditTool);
  const displayMode = useViewStore((s) => s.displayMode);
  const setDisplayMode = useViewStore((s) => s.setDisplayMode);

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <div className="toolbar-title">編集</div>
        {tools.map((t) => (
          <button
            key={t.id}
            className={`toolbar-btn ${editTool === t.id ? 'active' : ''}`}
            onClick={() => setEditTool(t.id)}
            title={t.label}
          >
            <span className="toolbar-icon">{t.icon}</span>
            <span className="toolbar-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-section">
        <div className="toolbar-title">表示</div>
        {displayModes.map((m) => (
          <button
            key={m.id}
            className={`toolbar-btn ${displayMode === m.id ? 'active' : ''}`}
            onClick={() => setDisplayMode(m.id)}
          >
            <span className="toolbar-label">{m.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-section">
        <button className="toolbar-btn run-btn" onClick={onRunAnalysis}>
          ▶ 解析実行
        </button>
      </div>
    </div>
  );
};
