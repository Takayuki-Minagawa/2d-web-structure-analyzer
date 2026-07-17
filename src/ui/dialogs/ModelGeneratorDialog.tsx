import React from 'react';
import {
  generateGridFrame,
  generateTemplateModel,
  type ModelTemplateKind,
} from '../../core/model/generators';
import { useT, type TKey } from '../../i18n';
import { useProjectStore } from '../../state/projectStore';
import { useSelectionStore } from '../../state/selectionStore';

interface Props {
  open: boolean;
  initial?: boolean;
  onClose: () => void;
}

function lengths(value: string, label: string, errorTemplate: string): number[] {
  const parsed = value.split(/[ ,;]+/).filter(Boolean).map(Number);
  if (parsed.length === 0 || parsed.some((item) => !Number.isFinite(item) || item <= 0)) {
    throw new Error(errorTemplate.replace('{label}', label));
  }
  return parsed;
}

const TEMPLATES: { id: ModelTemplateKind; titleKey: TKey; descriptionKey: TKey }[] = [
  { id: 'portal-frame', titleKey: 'generator.template.portal.title', descriptionKey: 'generator.template.portal.description' },
  { id: 'cantilever', titleKey: 'generator.template.cantilever.title', descriptionKey: 'generator.template.cantilever.description' },
  { id: 'continuous-beam', titleKey: 'generator.template.continuous.title', descriptionKey: 'generator.template.continuous.description' },
  { id: 'single-bay-3d', titleKey: 'generator.template.3d.title', descriptionKey: 'generator.template.3d.description' },
];

export const ModelGeneratorDialog: React.FC<Props> = ({ open, initial, onClose }) => {
  const t = useT();
  const model = useProjectStore((state) => state.model);
  const loadModel = useProjectStore((state) => state.loadModel);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const [mode, setMode] = React.useState<'template' | 'grid'>('template');
  const [template, setTemplate] = React.useState<ModelTemplateKind>('portal-frame');
  const [xSpans, setXSpans] = React.useState('600, 600');
  const [ySpans, setYSpans] = React.useState('600');
  const [stories, setStories] = React.useState('400, 400');
  const [columnSectionId, setColumnSectionId] = React.useState(model.sections[0]?.id ?? '');
  const [beamSectionId, setBeamSectionId] = React.useState(model.sections[0]?.id ?? '');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!model.sections.some((section) => section.id === columnSectionId)) setColumnSectionId(model.sections[0]?.id ?? '');
    if (!model.sections.some((section) => section.id === beamSectionId)) setBeamSectionId(model.sections[0]?.id ?? '');
  }, [model.sections, columnSectionId, beamSectionId]);

  if (!open) return null;

  const generate = () => {
    try {
      const generated = mode === 'template'
        ? generateTemplateModel(template)
        : generateGridFrame({
            title: t('generator.generatedTitle'),
            xSpans: lengths(xSpans, t('generator.xSpans'), t('generator.error.positiveLengths')),
            ySpans: lengths(ySpans, t('generator.ySpans'), t('generator.error.positiveLengths')),
            storyHeights: lengths(stories, t('generator.storyHeights'), t('generator.error.positiveLengths')),
            materials: model.materials,
            sections: model.sections,
            columnSectionId,
            beamSectionId,
            units: model.units,
          });
      clearSelection();
      loadModel(generated);
      setError('');
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('generator.error.failed'));
    }
  };

  return <div className="modal-overlay" role="presentation"><section className="modal-content generator-modal" role="dialog" aria-modal="true" aria-label={t('generator.ariaLabel')}>
    <header className="modal-header"><h2>{initial ? t('generator.initialTitle') : t('generator.title')}</h2>{!initial && <button onClick={onClose}>{t('common.close')}</button>}</header>
    <div className="generator-tabs"><button className={mode === 'template' ? 'active' : ''} onClick={() => setMode('template')}>{t('generator.templateTab')}</button><button className={mode === 'grid' ? 'active' : ''} onClick={() => setMode('grid')}>{t('generator.gridTab')}</button></div>
    <div className="modal-body">
      {mode === 'template' ? <div className="template-grid">{TEMPLATES.map((item) => <button key={item.id} className={template === item.id ? 'selected' : ''} onClick={() => setTemplate(item.id)}><strong>{t(item.titleKey)}</strong><span>{t(item.descriptionKey)}</span></button>)}</div> : <>
        <p className="muted">{t('generator.gridHint')}</p>
        <div className="generator-fields"><label>{t('generator.xSpans')} <input value={xSpans} onChange={(event) => setXSpans(event.target.value)} /></label><label>{t('generator.ySpans')} <input value={ySpans} onChange={(event) => setYSpans(event.target.value)} /></label><label>{t('generator.storyHeights')} <input value={stories} onChange={(event) => setStories(event.target.value)} /></label><label>{t('generator.columnSection')} <select value={columnSectionId} onChange={(event) => setColumnSectionId(event.target.value)}>{model.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label><label>{t('generator.beamSection')} <select value={beamSectionId} onChange={(event) => setBeamSectionId(event.target.value)}>{model.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label></div>
      </>}
      {error && <div className="error-text">{error}</div>}
    </div>
    <footer className="dialog-actions">{initial && <button onClick={onClose}>{t('generator.emptyStart')}</button>}<button className="primary" onClick={generate}>{t('generator.generateStart')}</button></footer>
  </section></div>;
};
