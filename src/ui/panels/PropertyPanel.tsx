import React from 'react';
import { useT } from '../../i18n';
import { useProjectStore } from '../../state/projectStore';
import { useSelectionStore } from '../../state/selectionStore';
import { BulkEditor, MemberEditor, NodeEditor } from './property/ElementEditors';
import {
  AnalysisSettingsEditor,
  CouplingsEditor,
  GravityEditor,
  LoadCasesEditor,
  ModelSummary,
  SelectionOperations,
  UnitsEditor,
} from './property/ProjectEditors';
import { MaterialsSectionsEditor } from './property/MaterialsSectionsEditor';

const Accordion: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, defaultOpen, children }) => (
  <details className="property-accordion" open={defaultOpen || undefined}>
    <summary>{title}</summary>
    <div className="accordion-body">{children}</div>
  </details>
);

export const PropertyPanel: React.FC = () => {
  const t = useT();
  const model = useProjectStore((state) => state.model);
  const selectedNodeIds = useSelectionStore((state) => state.selectedNodeIds);
  const selectedMemberIds = useSelectionStore((state) => state.selectedMemberIds);
  const selectionCount = selectedNodeIds.size + selectedMemberIds.size;
  const nodeId = selectionCount === 1 ? [...selectedNodeIds][0] : undefined;
  const memberId = selectionCount === 1 ? [...selectedMemberIds][0] : undefined;

  return (
    <aside className="property-panel" aria-label={t('prop.title')}>
      <h3>{t('prop.title')}</h3>
      {selectionCount > 1 && <BulkEditor nodeIds={selectedNodeIds} memberIds={selectedMemberIds} />}
      {nodeId && <NodeEditor nodeId={nodeId} />}
      {memberId && <MemberEditor memberId={memberId} />}
      {selectionCount > 0 && <Accordion title={t('prop.selectionTools')}><SelectionOperations /></Accordion>}
      {selectionCount === 0 && <>
        <Accordion title={t('prop.loadCases')} defaultOpen><LoadCasesEditor /></Accordion>
        <Accordion title={t('prop.analysisSettings')}><AnalysisSettingsEditor /></Accordion>
        <Accordion title={t('prop.gravity')}><GravityEditor /></Accordion>
        <Accordion title={t('prop.materialsSections')}><MaterialsSectionsEditor /></Accordion>
        <Accordion title={t('prop.couplings')}><CouplingsEditor /></Accordion>
        <Accordion title={t('prop.units')}><UnitsEditor /></Accordion>
        <Accordion title={t('prop.modelInfo')}><ModelSummary /></Accordion>
      </>}
      {model.nodes.length === 0 && selectionCount === 0 && <div className="empty-hint">{t('prop.emptyHint')}</div>}
    </aside>
  );
};
