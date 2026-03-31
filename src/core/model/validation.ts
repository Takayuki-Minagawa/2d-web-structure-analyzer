import type { ProjectModel, AnalysisError } from './types';

export function validateModel(model: ProjectModel): AnalysisError[] {
  const errors: AnalysisError[] = [];

  // Check: at least one node
  if (model.nodes.length === 0) {
    errors.push({
      type: 'validation',
      message: '節点が1つもありません。少なくとも1つの節点を作成してください。',
    });
  }

  // Check: at least one member
  if (model.members.length === 0) {
    errors.push({
      type: 'validation',
      message: '部材が1つもありません。少なくとも1つの部材を作成してください。',
    });
  }

  // Check: materials
  if (model.materials.length === 0) {
    errors.push({
      type: 'validation',
      message: '材料が定義されていません。',
    });
  }
  for (const mat of model.materials) {
    if (mat.E <= 0) {
      errors.push({
        type: 'validation',
        message: `材料 "${mat.name}" のヤング係数 E が正でありません (E=${mat.E})。`,
        elementId: mat.id,
      });
    }
  }

  // Check: sections
  if (model.sections.length === 0) {
    errors.push({
      type: 'validation',
      message: '断面が定義されていません。',
    });
  }
  for (const sec of model.sections) {
    if (sec.A <= 0) {
      errors.push({
        type: 'validation',
        message: `断面 "${sec.name}" の断面積 A が正でありません (A=${sec.A})。`,
        elementId: sec.id,
      });
    }
    if (sec.I <= 0) {
      errors.push({
        type: 'validation',
        message: `断面 "${sec.name}" の断面二次モーメント I が正でありません (I=${sec.I})。`,
        elementId: sec.id,
      });
    }
  }

  const nodeIds = new Set(model.nodes.map((n) => n.id));

  // Check: members
  for (const m of model.members) {
    // Node references
    if (!nodeIds.has(m.ni)) {
      errors.push({
        type: 'validation',
        message: `部材 ${m.id} の始端節点 ${m.ni} が存在しません。`,
        elementId: m.id,
      });
    }
    if (!nodeIds.has(m.nj)) {
      errors.push({
        type: 'validation',
        message: `部材 ${m.id} の終端節点 ${m.nj} が存在しません。`,
        elementId: m.id,
      });
    }

    // Zero-length member
    const ni = model.nodes.find((n) => n.id === m.ni);
    const nj = model.nodes.find((n) => n.id === m.nj);
    if (ni && nj) {
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-10) {
        errors.push({
          type: 'validation',
          message: `部材 ${m.id} の長さが 0 です。節点座標を確認してください。`,
          elementId: m.id,
        });
      }
    }

    // Material reference
    if (!model.materials.some((mat) => mat.id === m.materialId)) {
      errors.push({
        type: 'validation',
        message: `部材 ${m.id} の材料 ${m.materialId} が見つかりません。`,
        elementId: m.id,
      });
    }

    // Section reference
    if (!model.sections.some((sec) => sec.id === m.sectionId)) {
      errors.push({
        type: 'validation',
        message: `部材 ${m.id} の断面 ${m.sectionId} が見つかりません。`,
        elementId: m.id,
      });
    }
  }

  // Check: constraint sufficiency
  const hasUx = model.nodes.some((n) => n.restraint.ux);
  const hasUy = model.nodes.some((n) => n.restraint.uy);
  if (!hasUx || !hasUy) {
    errors.push({
      type: 'validation',
      message:
        '拘束不足の可能性があります。少なくともX方向とY方向の並進拘束が必要です。',
    });
  }

  // Check: isolated nodes (nodes not connected to any member)
  const connectedNodes = new Set<string>();
  for (const m of model.members) {
    connectedNodes.add(m.ni);
    connectedNodes.add(m.nj);
  }
  for (const n of model.nodes) {
    if (!connectedNodes.has(n.id) && model.members.length > 0) {
      errors.push({
        type: 'validation',
        message: `節点 ${n.id} はどの部材にも接続されていません（孤立節点）。`,
        nodeId: n.id,
      });
    }
  }

  // Check: member loads
  const memberIds = new Set(model.members.map((m) => m.id));
  for (const ml of model.memberLoads) {
    if (!memberIds.has(ml.memberId)) {
      errors.push({
        type: 'validation',
        message: `部材荷重 ${ml.id} の対象部材 ${ml.memberId} が見つかりません。`,
        elementId: ml.id,
      });
    }
    if (ml.type === 'point') {
      const member = model.members.find((m) => m.id === ml.memberId);
      if (member) {
        const ni = model.nodes.find((n) => n.id === member.ni);
        const nj = model.nodes.find((n) => n.id === member.nj);
        if (ni && nj) {
          const dx = nj.x - ni.x;
          const dy = nj.y - ni.y;
          const L = Math.sqrt(dx * dx + dy * dy);
          if (ml.a < -1e-10 || ml.a > L + 1e-10) {
            errors.push({
              type: 'validation',
              message: `部材荷重 ${ml.id} の作用位置 a=${ml.a} が部材長 L=${L.toFixed(3)} の範囲外です。`,
              elementId: ml.id,
            });
          }
        }
      }
    }
  }

  // Check: nodal loads
  for (const nl of model.nodalLoads) {
    if (!nodeIds.has(nl.nodeId)) {
      errors.push({
        type: 'validation',
        message: `節点荷重 ${nl.id} の対象節点 ${nl.nodeId} が見つかりません。`,
        nodeId: nl.nodeId,
      });
    }
  }

  return errors;
}
