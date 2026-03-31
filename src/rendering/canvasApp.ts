import type {
  ProjectModel,
  StructuralNode,
  Member,
} from '../core/model/types';
import type { AnalysisResult } from '../state/projectStore';
import type { DisplayMode } from '../state/viewStore';

export interface CanvasViewport {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface RenderOptions {
  displayMode: DisplayMode;
  showNodeLabels: boolean;
  showMemberLabels: boolean;
  showLoads: boolean;
  showSupports: boolean;
  deformationScale: number;
  diagramScale: number;
  selectedNodeIds: Set<string>;
  selectedMemberIds: Set<string>;
}

const NODE_RADIUS = 5;
const HIT_RADIUS = 10;
const COLORS = {
  background: '#1e1e2e',
  grid: '#2a2a3e',
  member: '#89b4fa',
  memberSelected: '#f9e2af',
  node: '#a6e3a1',
  nodeSelected: '#f38ba8',
  support: '#fab387',
  load: '#f38ba8',
  deformed: '#f9e2af',
  axialPositive: '#f38ba8',
  axialNegative: '#89b4fa',
  shear: '#a6e3a1',
  moment: '#cba6f7',
  text: '#cdd6f4',
  diagramFill: 'rgba(203, 166, 247, 0.2)',
};

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public viewport: CanvasViewport = { offsetX: 0, offsetY: 0, scale: 50 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2D context');
    this.ctx = ctx;
  }

  /** Convert model coords to screen coords */
  modelToScreen(x: number, y: number): [number, number] {
    const sx = x * this.viewport.scale + this.viewport.offsetX;
    const sy = -y * this.viewport.scale + this.viewport.offsetY; // Y flipped
    return [sx, sy];
  }

  /** Convert screen coords to model coords */
  screenToModel(sx: number, sy: number): [number, number] {
    const x = (sx - this.viewport.offsetX) / this.viewport.scale;
    const y = -(sy - this.viewport.offsetY) / this.viewport.scale;
    return [x, y];
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(
    model: ProjectModel,
    result: AnalysisResult | null,
    options: RenderOptions
  ) {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // Grid
    this.drawGrid(w, h);

    // Members
    for (const member of model.members) {
      this.drawMember(model, member, options);
    }

    // Supports
    if (options.showSupports) {
      for (const node of model.nodes) {
        if (node.restraint.ux || node.restraint.uy || node.restraint.rz) {
          this.drawSupport(node);
        }
      }
    }

    // Loads
    if (options.showLoads) {
      for (const nl of model.nodalLoads) {
        const node = model.nodes.find((n) => n.id === nl.nodeId);
        if (node) this.drawNodalLoad(node, nl.fx, nl.fy, nl.mz);
      }
      for (const ml of model.memberLoads) {
        const member = model.members.find((m) => m.id === ml.memberId);
        if (member) this.drawMemberLoad(model, member, ml);
      }
    }

    // Results overlay
    if (result && options.displayMode !== 'model') {
      this.drawResults(model, result, options);
    }

    // Nodes (drawn last so they are on top)
    for (const node of model.nodes) {
      this.drawNode(node, options);
    }

    // Labels
    if (options.showNodeLabels) {
      for (let i = 0; i < model.nodes.length; i++) {
        const node = model.nodes[i]!;
        const [sx, sy] = this.modelToScreen(node.x, node.y);
        ctx.fillStyle = COLORS.text;
        ctx.font = '11px monospace';
        ctx.fillText(`N${i}`, sx + 8, sy - 8);
      }
    }
    if (options.showMemberLabels) {
      for (let i = 0; i < model.members.length; i++) {
        const m = model.members[i]!;
        const ni = model.nodes.find((n) => n.id === m.ni);
        const nj = model.nodes.find((n) => n.id === m.nj);
        if (ni && nj) {
          const [sx, sy] = this.modelToScreen(
            (ni.x + nj.x) / 2,
            (ni.y + nj.y) / 2
          );
          ctx.fillStyle = COLORS.text;
          ctx.font = '11px monospace';
          ctx.fillText(`M${i}`, sx + 5, sy - 5);
        }
      }
    }
  }

  private drawGrid(w: number, h: number) {
    const ctx = this.ctx;
    const scale = this.viewport.scale;
    const step = this.getGridStep(scale);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;

    const [x0, y0] = this.screenToModel(0, h);
    const [x1, y1] = this.screenToModel(w, 0);

    const startX = Math.floor(x0 / step) * step;
    const startY = Math.floor(y0 / step) * step;

    ctx.beginPath();
    for (let x = startX; x <= x1; x += step) {
      const [sx] = this.modelToScreen(x, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = startY; y <= y1; y += step) {
      const [, sy] = this.modelToScreen(0, y);
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
  }

  private getGridStep(scale: number): number {
    const target = 50 / scale; // ~50px between grid lines
    const mag = Math.pow(10, Math.floor(Math.log10(target)));
    if (target / mag >= 5) return 5 * mag;
    if (target / mag >= 2) return 2 * mag;
    return mag;
  }

  private drawNode(node: StructuralNode, options: RenderOptions) {
    const ctx = this.ctx;
    const [sx, sy] = this.modelToScreen(node.x, node.y);
    const selected = options.selectedNodeIds.has(node.id);

    ctx.beginPath();
    ctx.arc(sx, sy, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = selected ? COLORS.nodeSelected : COLORS.node;
    ctx.fill();
  }

  private drawMember(
    model: ProjectModel,
    member: Member,
    options: RenderOptions
  ) {
    const ctx = this.ctx;
    const ni = model.nodes.find((n) => n.id === member.ni);
    const nj = model.nodes.find((n) => n.id === member.nj);
    if (!ni || !nj) return;

    const [x1, y1] = this.modelToScreen(ni.x, ni.y);
    const [x2, y2] = this.modelToScreen(nj.x, nj.y);
    const selected = options.selectedMemberIds.has(member.id);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = selected ? COLORS.memberSelected : COLORS.member;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();
  }

  private drawSupport(node: StructuralNode) {
    const ctx = this.ctx;
    const [sx, sy] = this.modelToScreen(node.x, node.y);
    const size = 12;

    ctx.strokeStyle = COLORS.support;
    ctx.lineWidth = 2;

    if (node.restraint.ux && node.restraint.uy && node.restraint.rz) {
      // Fixed support: filled triangle + ground lines
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - size, sy + size);
      ctx.lineTo(sx + size, sy + size);
      ctx.closePath();
      ctx.fillStyle = COLORS.support;
      ctx.fill();
      // Ground hatching
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + i * size * 0.6, sy + size);
        ctx.lineTo(sx + i * size * 0.6 - 4, sy + size + 6);
        ctx.stroke();
      }
    } else if (node.restraint.ux && node.restraint.uy) {
      // Pin support: triangle
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - size, sy + size);
      ctx.lineTo(sx + size, sy + size);
      ctx.closePath();
      ctx.stroke();
    } else if (node.restraint.uy) {
      // Roller (vertical): triangle + circle
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - size, sy + size);
      ctx.lineTo(sx + size, sy + size);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy + size + 4, 3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (node.restraint.ux) {
      // Roller (horizontal): rotated triangle
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - size, sy - size);
      ctx.lineTo(sx - size, sy + size);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx - size - 4, sy, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawNodalLoad(
    node: StructuralNode,
    fx: number,
    fy: number,
    mz: number
  ) {
    const ctx = this.ctx;
    const [sx, sy] = this.modelToScreen(node.x, node.y);
    const arrowLen = 40;
    const arrowHead = 8;

    ctx.strokeStyle = COLORS.load;
    ctx.fillStyle = COLORS.load;
    ctx.lineWidth = 2;

    if (Math.abs(fx) > 1e-10) {
      const dir = fx > 0 ? 1 : -1;
      const ex = sx + dir * arrowLen;
      ctx.beginPath();
      ctx.moveTo(ex, sy);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      // Arrowhead pointing toward node
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dir * arrowHead, sy - arrowHead / 2);
      ctx.lineTo(sx + dir * arrowHead, sy + arrowHead / 2);
      ctx.closePath();
      ctx.fill();
      ctx.font = '10px monospace';
      ctx.fillText(`${Math.abs(fx).toFixed(1)}`, ex - 10 * dir, sy - 8);
    }

    if (Math.abs(fy) > 1e-10) {
      const dir = fy > 0 ? -1 : 1; // screen Y is flipped
      const ey = sy + dir * arrowLen;
      ctx.beginPath();
      ctx.moveTo(sx, ey);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - arrowHead / 2, sy + dir * arrowHead);
      ctx.lineTo(sx + arrowHead / 2, sy + dir * arrowHead);
      ctx.closePath();
      ctx.fill();
      ctx.font = '10px monospace';
      ctx.fillText(`${Math.abs(fy).toFixed(1)}`, sx + 8, ey);
    }

    if (Math.abs(mz) > 1e-10) {
      const r = 15;
      ctx.beginPath();
      const startAngle = mz > 0 ? 0 : Math.PI;
      const endAngle = mz > 0 ? Math.PI * 1.5 : Math.PI * 0.5;
      ctx.arc(sx, sy, r, startAngle, endAngle, mz < 0);
      ctx.stroke();
      ctx.font = '10px monospace';
      ctx.fillText(`${Math.abs(mz).toFixed(1)}`, sx + r + 4, sy - r);
    }
  }

  private drawMemberLoad(
    model: ProjectModel,
    member: Member,
    load: import('../core/model/types').MemberLoad
  ) {
    const ctx = this.ctx;
    const ni = model.nodes.find((n) => n.id === member.ni);
    const nj = model.nodes.find((n) => n.id === member.nj);
    if (!ni || !nj) return;

    const [x1, y1] = this.modelToScreen(ni.x, ni.y);
    const [x2, y2] = this.modelToScreen(nj.x, nj.y);

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    // Unit vectors along and perpendicular to member
    const ux = dx / len;
    const uy = dy / len;
    // Perpendicular (local Y in screen space, considering Y flip)
    const px = -uy;
    const py = ux;

    ctx.strokeStyle = COLORS.load;
    ctx.fillStyle = COLORS.load;
    ctx.lineWidth = 1.5;

    const arrowSize = 25;

    if (load.type === 'udl') {
      const numArrows = Math.max(3, Math.floor(len / 30));
      const isAxial = load.direction === 'localX';
      const dir = load.value > 0 ? 1 : -1;

      for (let i = 0; i <= numArrows; i++) {
        const t = i / numArrows;
        const bx = x1 + dx * t;
        const by = y1 + dy * t;

        if (isAxial) {
          const ex = bx + ux * arrowSize * dir;
          const ey = by + uy * arrowSize * dir;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(bx, by);
          ctx.stroke();
        } else {
          const ex = bx + px * arrowSize * dir;
          const ey = by + py * arrowSize * dir;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }

      // Connect arrow bases
      if (!isAxial) {
        ctx.beginPath();
        ctx.moveTo(x1 + px * arrowSize * dir, y1 + py * arrowSize * dir);
        ctx.lineTo(x2 + px * arrowSize * dir, y2 + py * arrowSize * dir);
        ctx.stroke();
      }
    } else if (load.type === 'point') {
      const bx = x1 + dx * (load.a * this.viewport.scale / len);
      const by = y1 + dy * (load.a * this.viewport.scale / len);
      const isAxial = load.direction === 'localX';
      const dir = load.value > 0 ? 1 : -1;

      if (isAxial) {
        const ex = bx + ux * arrowSize * dir;
        const ey = by + uy * arrowSize * dir;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(bx, by);
        ctx.stroke();
        this.drawArrowHead(ctx, bx, by, ux * dir, uy * dir);
      } else {
        const ex = bx + px * arrowSize * dir;
        const ey = by + py * arrowSize * dir;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(bx, by);
        ctx.stroke();
        this.drawArrowHead(ctx, bx, by, px * dir, py * dir);
      }
    }
  }

  private drawArrowHead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dirX: number,
    dirY: number
  ) {
    const size = 6;
    const px = -dirY;
    const py = dirX;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dirX * size + px * size * 0.4, y + dirY * size + py * size * 0.4);
    ctx.lineTo(x + dirX * size - px * size * 0.4, y + dirY * size - py * size * 0.4);
    ctx.closePath();
    ctx.fill();
  }

  private drawResults(
    model: ProjectModel,
    result: AnalysisResult,
    options: RenderOptions
  ) {
    const { displayMode, deformationScale, diagramScale } = options;

    if (displayMode === 'deformation') {
      this.drawDeformation(model, result, deformationScale);
    } else {
      this.drawDiagrams(model, result, displayMode, diagramScale);
    }
  }

  private drawDeformation(
    model: ProjectModel,
    result: AnalysisResult,
    scale: number
  ) {
    const ctx = this.ctx;

    for (const member of model.members) {
      const diagram = result.diagrams[member.id];
      if (!diagram) continue;

      const ni = model.nodes.find((n) => n.id === member.ni);
      const nj = model.nodes.find((n) => n.id === member.nj);
      if (!ni || !nj) continue;

      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-10) continue;

      const cos = dx / L;
      const sin = dy / L;

      ctx.beginPath();
      ctx.strokeStyle = COLORS.deformed;
      ctx.lineWidth = 2;

      for (let i = 0; i < diagram.points.length; i++) {
        const pt = diagram.points[i]!;
        // Local to global displacement
        const gux = pt.ux * cos - pt.uy * sin;
        const guy = pt.ux * sin + pt.uy * cos;
        // Position along member in global
        const xi = pt.x / L;
        const mx = ni.x + dx * xi + gux * scale;
        const my = ni.y + dy * xi + guy * scale;
        const [sx, sy] = this.modelToScreen(mx, my);

        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
  }

  private drawDiagrams(
    model: ProjectModel,
    result: AnalysisResult,
    mode: DisplayMode,
    scale: number
  ) {
    const ctx = this.ctx;

    for (const member of model.members) {
      const diagram = result.diagrams[member.id];
      if (!diagram) continue;

      const ni = model.nodes.find((n) => n.id === member.ni);
      const nj = model.nodes.find((n) => n.id === member.nj);
      if (!ni || !nj) continue;

      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-10) continue;

      const cos = dx / L;
      const sin = dy / L;
      // Perpendicular direction (local Y in global)
      const px = -sin;
      const py = cos;

      const fillColor = COLORS.diagramFill;

      // Draw filled diagram
      ctx.beginPath();

      // Start at member i-end
      const [sx0, sy0] = this.modelToScreen(ni.x, ni.y);
      ctx.moveTo(sx0, sy0);

      let maxVal = 0;
      let maxPt: { sx: number; sy: number; val: number } | null = null;
      let minVal = 0;
      let minPt: { sx: number; sy: number; val: number } | null = null;

      for (const pt of diagram.points) {
        const value = mode === 'axial' ? pt.N : mode === 'shear' ? pt.V : pt.M;

        const xi = pt.x / L;
        const baseX = ni.x + dx * xi;
        const baseY = ni.y + dy * xi;
        const offsetX = baseX + px * value * scale * 0.001;
        const offsetY = baseY + py * value * scale * 0.001;
        const [sx, sy] = this.modelToScreen(offsetX, offsetY);
        ctx.lineTo(sx, sy);

        if (value > maxVal) {
          maxVal = value;
          maxPt = { sx, sy, val: value };
        }
        if (value < minVal) {
          minVal = value;
          minPt = { sx, sy, val: value };
        }
      }

      // Close back along member
      const [sx1, sy1] = this.modelToScreen(nj.x, nj.y);
      ctx.lineTo(sx1, sy1);
      ctx.closePath();

      if (mode === 'axial') {
        ctx.fillStyle = 'rgba(137, 180, 250, 0.15)';
      } else if (mode === 'shear') {
        ctx.fillStyle = 'rgba(166, 227, 161, 0.15)';
      } else {
        ctx.fillStyle = fillColor;
      }
      ctx.fill();

      // Draw outline
      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      for (const pt of diagram.points) {
        let value: number;
        if (mode === 'axial') value = pt.N;
        else if (mode === 'shear') value = pt.V;
        else value = pt.M;

        const xi = pt.x / L;
        const baseX = ni.x + dx * xi;
        const baseY = ni.y + dy * xi;
        const offsetX = baseX + px * value * scale * 0.001;
        const offsetY = baseY + py * value * scale * 0.001;
        const [sx, sy] = this.modelToScreen(offsetX, offsetY);
        ctx.lineTo(sx, sy);
      }

      if (mode === 'axial') {
        ctx.strokeStyle = COLORS.axialPositive;
      } else if (mode === 'shear') {
        ctx.strokeStyle = COLORS.shear;
      } else {
        ctx.strokeStyle = COLORS.moment;
      }
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Max/min labels
      ctx.font = '10px monospace';
      ctx.fillStyle = COLORS.text;
      if (maxPt && Math.abs(maxPt.val) > 1e-6) {
        ctx.fillText(maxPt.val.toFixed(2), maxPt.sx + 4, maxPt.sy - 4);
      }
      if (minPt && Math.abs(minPt.val) > 1e-6) {
        ctx.fillText(minPt.val.toFixed(2), minPt.sx + 4, minPt.sy + 12);
      }
    }
  }

  // Hit testing
  findNodeAt(
    screenX: number,
    screenY: number,
    nodes: StructuralNode[]
  ): StructuralNode | null {
    for (const node of nodes) {
      const [sx, sy] = this.modelToScreen(node.x, node.y);
      const dx = screenX - sx;
      const dy = screenY - sy;
      if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
        return node;
      }
    }
    return null;
  }

  findMemberAt(
    screenX: number,
    screenY: number,
    model: ProjectModel
  ): Member | null {
    for (const member of model.members) {
      const ni = model.nodes.find((n) => n.id === member.ni);
      const nj = model.nodes.find((n) => n.id === member.nj);
      if (!ni || !nj) continue;

      const [x1, y1] = this.modelToScreen(ni.x, ni.y);
      const [x2, y2] = this.modelToScreen(nj.x, nj.y);

      const dist = pointToSegmentDist(screenX, screenY, x1, y1, x2, y2);
      if (dist <= HIT_RADIUS) return member;
    }
    return null;
  }
}

function pointToSegmentDist(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) {
    const ddx = px - x1;
    const ddy = py - y1;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const ddx = px - closestX;
  const ddy = py - closestY;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}
