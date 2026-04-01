import React from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useSelectionStore } from '../../state/selectionStore';
import { useViewStore } from '../../state/viewStore';
import { useT } from '../../i18n';
import type { StructuralNode, Member, NodalLoad, MemberLoad } from '../../core/model/types';

export const PropertyPanel: React.FC = () => {
  const model = useProjectStore((s) => s.model);
  const updateNode = useProjectStore((s) => s.updateNode);
  const updateMember = useProjectStore((s) => s.updateMember);
  const addNodalLoad = useProjectStore((s) => s.addNodalLoad);
  const updateNodalLoad = useProjectStore((s) => s.updateNodalLoad);
  const removeNodalLoad = useProjectStore((s) => s.removeNodalLoad);
  const addMemberLoad = useProjectStore((s) => s.addMemberLoad);
  const updateMemberLoad = useProjectStore((s) => s.updateMemberLoad);
  const removeMemberLoad = useProjectStore((s) => s.removeMemberLoad);
  const removeNode = useProjectStore((s) => s.removeNode);
  const removeMember = useProjectStore((s) => s.removeMember);

  const selectedNodeIds = useSelectionStore((s) => s.selectedNodeIds);
  const selectedMemberIds = useSelectionStore((s) => s.selectedMemberIds);

  const deformationScale = useViewStore((s) => s.deformationScale);
  const diagramScale = useViewStore((s) => s.diagramScale);
  const setDeformationScale = useViewStore((s) => s.setDeformationScale);
  const setDiagramScale = useViewStore((s) => s.setDiagramScale);
  const showNodeLabels = useViewStore((s) => s.showNodeLabels);
  const showMemberLabels = useViewStore((s) => s.showMemberLabels);
  const showLoads = useViewStore((s) => s.showLoads);
  const showSupports = useViewStore((s) => s.showSupports);
  const setShowNodeLabels = useViewStore((s) => s.setShowNodeLabels);
  const setShowMemberLabels = useViewStore((s) => s.setShowMemberLabels);
  const setShowLoads = useViewStore((s) => s.setShowLoads);
  const setShowSupports = useViewStore((s) => s.setShowSupports);

  const t = useT();

  const selectedNodes = model.nodes.filter((n) => selectedNodeIds.has(n.id));
  const selectedMembers = model.members.filter((m) => selectedMemberIds.has(m.id));

  return (
    <div className="property-panel">
      <h3>{t('prop.title')}</h3>

      {selectedNodes.length === 1 && (
        <NodeProperties
          node={selectedNodes[0]!}
          nodalLoads={model.nodalLoads.filter((l) => l.nodeId === selectedNodes[0]!.id)}
          onUpdate={updateNode}
          onDelete={removeNode}
          onAddLoad={(nodeId) => addNodalLoad({ nodeId, fx: 0, fy: -10, mz: 0 })}
          onUpdateLoad={updateNodalLoad}
          onRemoveLoad={removeNodalLoad}
        />
      )}

      {selectedMembers.length === 1 && (
        <MemberProperties
          member={selectedMembers[0]!}
          model={model}
          memberLoads={model.memberLoads.filter((l) => l.memberId === selectedMembers[0]!.id)}
          onUpdate={updateMember}
          onDelete={removeMember}
          onAddLoad={(memberId) =>
            addMemberLoad({ memberId, type: 'udl', direction: 'localY', value: -5 })
          }
          onUpdateLoad={updateMemberLoad}
          onRemoveLoad={removeMemberLoad}
        />
      )}

      {selectedNodes.length === 0 && selectedMembers.length === 0 && (
        <>
          <div className="prop-group">
            <div className="prop-title">{t('prop.displaySettings')}</div>
            <label className="checkbox-label">
              <input type="checkbox" checked={showNodeLabels} onChange={(e) => setShowNodeLabels(e.target.checked)} />
              {t('prop.nodeLabels')}
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={showMemberLabels} onChange={(e) => setShowMemberLabels(e.target.checked)} />
              {t('prop.memberLabels')}
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={showLoads} onChange={(e) => setShowLoads(e.target.checked)} />
              {t('prop.showLoads')}
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={showSupports} onChange={(e) => setShowSupports(e.target.checked)} />
              {t('prop.supports')}
            </label>
          </div>
          <div className="prop-group">
            <div className="prop-title">{t('prop.scale')}</div>
            <label>{t('prop.deformScale')} {deformationScale.toFixed(0)}</label>
            <input
              type="range"
              min="1"
              max="500"
              value={deformationScale}
              onChange={(e) => setDeformationScale(Number(e.target.value))}
            />
            <label>{t('prop.diagramScale')} {diagramScale.toFixed(1)}</label>
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={diagramScale}
              onChange={(e) => setDiagramScale(Number(e.target.value))}
            />
          </div>
          <ModelSummary />
        </>
      )}
    </div>
  );
};

const NodeProperties: React.FC<{
  node: StructuralNode;
  nodalLoads: NodalLoad[];
  onUpdate: (id: string, u: Partial<Pick<StructuralNode, 'x' | 'y' | 'restraint'>>) => void;
  onDelete: (id: string) => void;
  onAddLoad: (nodeId: string) => void;
  onUpdateLoad: (id: string, updates: Partial<Omit<NodalLoad, 'id'>>) => void;
  onRemoveLoad: (id: string) => void;
}> = ({ node, nodalLoads, onUpdate, onDelete, onAddLoad, onUpdateLoad, onRemoveLoad }) => {
  const t = useT();
  return (
    <div className="prop-group">
      <div className="prop-title">{t('prop.node')} {node.id.substring(0, 5)}</div>
      <div className="prop-row">
        <label>X:</label>
        <input
          type="number"
          value={node.x}
          step="0.1"
          onChange={(e) => onUpdate(node.id, { x: Number(e.target.value) })}
        />
      </div>
      <div className="prop-row">
        <label>Y:</label>
        <input
          type="number"
          value={node.y}
          step="0.1"
          onChange={(e) => onUpdate(node.id, { y: Number(e.target.value) })}
        />
      </div>
      <div className="prop-title">{t('prop.restraints')}</div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={node.restraint.ux}
          onChange={(e) =>
            onUpdate(node.id, { restraint: { ...node.restraint, ux: e.target.checked } })
          }
        />
        {t('prop.dirX')}
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={node.restraint.uy}
          onChange={(e) =>
            onUpdate(node.id, { restraint: { ...node.restraint, uy: e.target.checked } })
          }
        />
        {t('prop.dirY')}
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={node.restraint.rz}
          onChange={(e) =>
            onUpdate(node.id, { restraint: { ...node.restraint, rz: e.target.checked } })
          }
        />
        {t('prop.rotation')}
      </label>
      {nodalLoads.length > 0 && (
        <>
          <div className="prop-title">{t('prop.nodalLoads')}</div>
          {nodalLoads.map((load) => (
            <div key={load.id} className="load-item">
              <div className="prop-row">
                <label>Fx:</label>
                <input
                  type="number"
                  value={load.fx}
                  step="1"
                  onChange={(e) => onUpdateLoad(load.id, { fx: Number(e.target.value) })}
                />
              </div>
              <div className="prop-row">
                <label>Fy:</label>
                <input
                  type="number"
                  value={load.fy}
                  step="1"
                  onChange={(e) => onUpdateLoad(load.id, { fy: Number(e.target.value) })}
                />
              </div>
              <div className="prop-row">
                <label>Mz:</label>
                <input
                  type="number"
                  value={load.mz}
                  step="1"
                  onChange={(e) => onUpdateLoad(load.id, { mz: Number(e.target.value) })}
                />
              </div>
              <button className="danger small" onClick={() => onRemoveLoad(load.id)}>{t('prop.removeLoad')}</button>
            </div>
          ))}
        </>
      )}
      <div className="prop-actions">
        <button onClick={() => onAddLoad(node.id)}>{t('prop.addLoad')}</button>
        <button className="danger" onClick={() => onDelete(node.id)}>{t('prop.delete')}</button>
      </div>
    </div>
  );
};

const MemberProperties: React.FC<{
  member: Member;
  model: import('../../core/model/types').ProjectModel;
  memberLoads: MemberLoad[];
  onUpdate: (id: string, u: Partial<Pick<Member, 'materialId' | 'sectionId'>>) => void;
  onDelete: (id: string) => void;
  onAddLoad: (memberId: string) => void;
  onUpdateLoad: (id: string, updates: Partial<Omit<MemberLoad, 'id'>>) => void;
  onRemoveLoad: (id: string) => void;
}> = ({ member, model, memberLoads, onUpdate, onDelete, onAddLoad, onUpdateLoad, onRemoveLoad }) => {
  const t = useT();
  const ni = model.nodes.find((n) => n.id === member.ni);
  const nj = model.nodes.find((n) => n.id === member.nj);
  const L = ni && nj ? Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2) : 0;

  return (
    <div className="prop-group">
      <div className="prop-title">{t('prop.member')} {member.id.substring(0, 5)}</div>
      <div className="prop-row">
        <label>{t('prop.length')}</label>
        <span>{L.toFixed(3)} m</span>
      </div>
      <div className="prop-row">
        <label>{t('prop.material')}</label>
        <select
          value={member.materialId}
          onChange={(e) => onUpdate(member.id, { materialId: e.target.value })}
        >
          {model.materials.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      <div className="prop-row">
        <label>{t('prop.section')}</label>
        <select
          value={member.sectionId}
          onChange={(e) => onUpdate(member.id, { sectionId: e.target.value })}
        >
          {model.sections.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      {memberLoads.length > 0 && (
        <>
          <div className="prop-title">{t('prop.memberLoads')}</div>
          {memberLoads.map((load) => (
            <div key={load.id} className="load-item">
              <div className="prop-row">
                <label>{t('prop.loadType')}</label>
                <select
                  value={load.type}
                  onChange={(e) => {
                    const newType = e.target.value as 'udl' | 'point';
                    if (newType === 'point') {
                      onUpdateLoad(load.id, { type: 'point', a: 0 } as Partial<Omit<MemberLoad, 'id'>>);
                    } else {
                      onUpdateLoad(load.id, { type: 'udl' } as Partial<Omit<MemberLoad, 'id'>>);
                    }
                  }}
                >
                  <option value="udl">{t('prop.loadTypeUdl')}</option>
                  <option value="point">{t('prop.loadTypePoint')}</option>
                </select>
              </div>
              <div className="prop-row">
                <label>{t('prop.loadDirection')}</label>
                <select
                  value={load.direction}
                  onChange={(e) => onUpdateLoad(load.id, { direction: e.target.value as 'localX' | 'localY' })}
                >
                  <option value="localY">localY</option>
                  <option value="localX">localX</option>
                </select>
              </div>
              <div className="prop-row">
                <label>{load.type === 'udl' ? t('prop.loadIntensity') : t('prop.loadMagnitude')}</label>
                <input
                  type="number"
                  value={load.value}
                  step="1"
                  onChange={(e) => onUpdateLoad(load.id, { value: Number(e.target.value) })}
                />
              </div>
              {load.type === 'point' && (
                <div className="prop-row">
                  <label>{t('prop.loadPosition')}</label>
                  <input
                    type="number"
                    value={load.a}
                    step="0.1"
                    min="0"
                    max={L}
                    onChange={(e) => onUpdateLoad(load.id, { a: Number(e.target.value) } as Partial<Omit<MemberLoad, 'id'>>)}
                  />
                </div>
              )}
              <button className="danger small" onClick={() => onRemoveLoad(load.id)}>{t('prop.removeLoad')}</button>
            </div>
          ))}
        </>
      )}
      <div className="prop-actions">
        <button onClick={() => onAddLoad(member.id)}>{t('prop.addLoad')}</button>
        <button className="danger" onClick={() => onDelete(member.id)}>{t('prop.delete')}</button>
      </div>
    </div>
  );
};

const ModelSummary: React.FC = () => {
  const model = useProjectStore((s) => s.model);
  const analysisResult = useProjectStore((s) => s.analysisResult);
  const analysisError = useProjectStore((s) => s.analysisError);
  const isResultStale = useProjectStore((s) => s.isResultStale);
  const t = useT();

  return (
    <div className="prop-group">
      <div className="prop-title">{t('prop.modelInfo')}</div>
      <div className="prop-row"><label>{t('prop.nodeCount')}</label><span>{model.nodes.length}</span></div>
      <div className="prop-row"><label>{t('prop.memberCount')}</label><span>{model.members.length}</span></div>
      <div className="prop-row"><label>{t('prop.nodalLoadCount')}</label><span>{model.nodalLoads.length}</span></div>
      <div className="prop-row"><label>{t('prop.memberLoadCount')}</label><span>{model.memberLoads.length}</span></div>
      {isResultStale && analysisResult && (
        <div className="warning-text">{t('prop.staleWarning')}</div>
      )}
      {analysisError && (
        <div className="error-text">{analysisError.message}</div>
      )}
    </div>
  );
};
