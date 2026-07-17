import React from 'react';
import { MATERIAL_PRESETS, SECTION_PRESETS } from '../../../core/model/library';
import {
  calculateCircularHollowSection,
  calculateHSection,
  calculateRectangleSection,
  calculateRectangularHollowSection,
} from '../../../core/model/sectionCalculators';
import { useT } from '../../../i18n';
import { useProjectStore } from '../../../state/projectStore';

export const MaterialsSectionsEditor: React.FC = () => {
  const t = useT();
  const model = useProjectStore((state) => state.model);
  const addMaterial = useProjectStore((state) => state.addMaterial);
  const updateMaterial = useProjectStore((state) => state.updateMaterial);
  const removeMaterial = useProjectStore((state) => state.removeMaterial);
  const addSection = useProjectStore((state) => state.addSection);
  const updateSection = useProjectStore((state) => state.updateSection);
  const removeSection = useProjectStore((state) => state.removeSection);
  const [materialId, setMaterialId] = React.useState(model.materials[0]?.id ?? '');
  const [sectionId, setSectionId] = React.useState(model.sections[0]?.id ?? '');
  const material = model.materials.find((item) => item.id === materialId) ?? model.materials[0];
  const section = model.sections.find((item) => item.id === sectionId) ?? model.sections[0];
  const usedMaterials = new Set(model.sections.map((item) => item.materialId));
  const usedSections = new Set(model.members.map((item) => item.sectionId));

  return <div className="project-editor">
    <div className="library-header"><strong>{t('prop.materials')}</strong><select value={material?.id ?? ''} onChange={(event) => setMaterialId(event.target.value)}>{model.materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    {material && <div className="editable-item"><div className="prop-row"><label>{t('common.name')}</label><input value={material.name} onChange={(event) => updateMaterial(material.id, { name: event.target.value })} /></div>{(['E', 'G', 'nu', 'expansion', 'density'] as const).map((key) => <div className="prop-row" key={key}><label>{key}</label><input type="number" min={key === 'density' ? 0 : undefined} value={material[key] ?? 0} onChange={(event) => updateMaterial(material.id, { [key]: Number(event.target.value) })} /></div>)}{!usedMaterials.has(material.id) && <button className="danger small" onClick={() => removeMaterial(material.id)}>{t('prop.removeMaterial')}</button>}</div>}
    <div className="prop-row"><label>{t('prop.materialPreset')}</label><select defaultValue="" onChange={(event) => { const preset = MATERIAL_PRESETS.find((item) => item.name === event.target.value); if (preset) setMaterialId(addMaterial({ ...preset })); event.currentTarget.value = ''; }}><option value="">{t('prop.addPreset')}</option>{MATERIAL_PRESETS.map((preset) => <option key={preset.name}>{preset.name}</option>)}</select></div>
    <hr />
    <div className="library-header"><strong>{t('prop.sections')}</strong><select value={section?.id ?? ''} onChange={(event) => setSectionId(event.target.value)}>{model.sections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    {section && <div className="editable-item"><div className="prop-row"><label>{t('common.name')}</label><input value={section.name} onChange={(event) => updateSection(section.id, { name: event.target.value })} /></div><div className="prop-row"><label>{t('prop.materials')}</label><select value={section.materialId} onChange={(event) => updateSection(section.id, { materialId: event.target.value })}>{model.materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>{(['A', 'Ix', 'Iy', 'Iz', 'ky', 'kz'] as const).map((key) => <div className="prop-row" key={key}><label>{key}</label><input type="number" value={section[key]} onChange={(event) => updateSection(section.id, { [key]: Number(event.target.value) })} /></div>)}{!usedSections.has(section.id) && <button className="danger small" onClick={() => removeSection(section.id)}>{t('prop.removeSection')}</button>}</div>}
    <div className="prop-row"><label>{t('prop.sectionPreset')}</label><select defaultValue="" onChange={(event) => { const preset = SECTION_PRESETS.find((item) => item.name === event.target.value); const mat = material ?? model.materials[0]; if (preset && mat) setSectionId(addSection({ ...preset, materialId: mat.id })); event.currentTarget.value = ''; }}><option value="">{t('prop.addPreset')}</option>{SECTION_PRESETS.map((preset) => <option key={preset.name}>{preset.name}</option>)}</select></div>
    <SectionCalculator materialId={material?.id ?? model.materials[0]?.id ?? ''} onCreate={(properties) => setSectionId(addSection(properties))} />
  </div>;
};

const SectionCalculator: React.FC<{ materialId: string; onCreate: (section: { name: string; materialId: string; A: number; Ix: number; Iy: number; Iz: number; ky: number; kz: number }) => void }> = ({ materialId, onCreate }) => {
  const t = useT();
  const [shape, setShape] = React.useState<'rectangle' | 'h' | 'rhs' | 'chs'>('rectangle');
  const [dims, setDims] = React.useState({ width: 20, height: 40, tw: 1, tf: 1.5, thickness: 1, diameter: 30 });
  const create = () => {
    let result;
    if (shape === 'h') result = calculateHSection({ B: dims.width, H: dims.height, tw: dims.tw, tf: dims.tf });
    else if (shape === 'rhs') result = calculateRectangularHollowSection({ B: dims.width, H: dims.height, t: dims.thickness });
    else if (shape === 'chs') result = calculateCircularHollowSection({ D: dims.diameter, t: dims.thickness });
    else result = calculateRectangleSection({ B: dims.width, H: dims.height });
    onCreate({ name: t('prop.calculatedSectionName').replace('{shape}', shape.toUpperCase()), materialId, ...result });
  };
  return <details className="nested-details"><summary>{t('prop.sectionCalculator')}</summary><div className="prop-row"><label>{t('prop.shape')}</label><select value={shape} onChange={(event) => setShape(event.target.value as typeof shape)}><option value="rectangle">{t('prop.shapeRectangle')}</option><option value="h">{t('prop.shapeH')}</option><option value="rhs">{t('prop.shapeRhs')}</option><option value="chs">{t('prop.shapeChs')}</option></select></div>{shape !== 'chs' && <><div className="prop-row"><label>B</label><input type="number" value={dims.width} onChange={(event) => setDims({ ...dims, width: Number(event.target.value) })} /></div><div className="prop-row"><label>H</label><input type="number" value={dims.height} onChange={(event) => setDims({ ...dims, height: Number(event.target.value) })} /></div></>}{shape === 'h' && <><div className="prop-row"><label>tw</label><input type="number" value={dims.tw} onChange={(event) => setDims({ ...dims, tw: Number(event.target.value) })} /></div><div className="prop-row"><label>tf</label><input type="number" value={dims.tf} onChange={(event) => setDims({ ...dims, tf: Number(event.target.value) })} /></div></>}{shape === 'rhs' && <div className="prop-row"><label>t</label><input type="number" value={dims.thickness} onChange={(event) => setDims({ ...dims, thickness: Number(event.target.value) })} /></div>}{shape === 'chs' && <><div className="prop-row"><label>D</label><input type="number" value={dims.diameter} onChange={(event) => setDims({ ...dims, diameter: Number(event.target.value) })} /></div><div className="prop-row"><label>t</label><input type="number" value={dims.thickness} onChange={(event) => setDims({ ...dims, thickness: Number(event.target.value) })} /></div></>}<div className="prop-actions"><button disabled={!materialId} onClick={create}>{t('prop.registerSection')}</button></div></details>;
};
