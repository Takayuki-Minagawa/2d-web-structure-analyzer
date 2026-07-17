import React from 'react';
import { useT } from '../../i18n';
import type { JsonImportResult } from '../../io/jsonImporter';

interface Props {
  report: JsonImportResult | null;
  onSelectLoadCase?: (index: number) => void;
  onClose: () => void;
}

export const ImportSummaryDialog: React.FC<Props> = ({ report, onSelectLoadCase, onClose }) => {
  const t = useT();
  if (!report) return null;
  const summary = report.summary;
  const selectedCase = report.loadCases.find((loadCase) => loadCase.selected)?.index ?? 0;
  return <div className="modal-overlay" role="presentation"><section className="modal-content import-summary" role="dialog" aria-modal="true" aria-label={t('import.title')}>
    <header className="modal-header"><h2>{t('import.title')}</h2><button onClick={onClose}>{t('common.close')}</button></header>
    <div className="modal-body">
      <div className="summary-grid import-grid"><span>{t('import.format')}</span><strong>{summary.format}</strong><span>{t('import.nodes')}</span><strong>{summary.nodes}</strong><span>{t('import.members')}</span><strong>{summary.members}</strong><span>{t('import.materialsSections')}</span><strong>{summary.materials} / {summary.sections}</strong><span>{t('import.loads')}</span><strong>{summary.nodalLoads} / {summary.memberLoads}</strong><span>{t('import.skipped')}</span><strong>{summary.skippedMembers} / {summary.ignoredWalls}</strong></div>
      {report.loadCases.length > 1 && onSelectLoadCase && <div className="prop-row import-case"><label>{t('import.loadCase')}</label><select value={selectedCase} onChange={(event) => onSelectLoadCase(Number(event.target.value))}>{report.loadCases.map((loadCase) => <option value={loadCase.index} key={loadCase.index}>{loadCase.index + 1}: {loadCase.name}</option>)}</select></div>}
      {report.warnings.length > 0 ? <div className="import-warnings"><h3>{t('import.warnings')}</h3><ul>{report.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><strong>{warning.code}</strong>: {warning.message}{warning.itemIds && warning.itemIds.length <= 12 && <small> [{warning.itemIds.join(', ')}]</small>}</li>)}</ul></div> : <div className="success-text">{t('import.noWarnings')}</div>}
    </div>
  </section></div>;
};
