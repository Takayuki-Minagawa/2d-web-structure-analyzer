import type { Member, ProjectModel, StructuralNode } from './types';

function normalizeNumbers<T extends { number?: number }>(items: T[]): T[] {
  const used = new Set<number>();
  let next = 1;

  return items.map((item) => {
    const candidate = item.number;
    if (Number.isInteger(candidate) && (candidate ?? 0) > 0 && !used.has(candidate!)) {
      used.add(candidate!);
      next = Math.max(next, candidate! + 1);
      return item;
    }
    while (used.has(next)) next += 1;
    const numbered = { ...item, number: next };
    used.add(next);
    next += 1;
    return numbered;
  });
}

export function ensureDisplayNumbers(model: ProjectModel): ProjectModel {
  return {
    ...model,
    nodes: normalizeNumbers(model.nodes ?? []),
    members: normalizeNumbers(model.members ?? []),
  };
}

export function nextDisplayNumber(items: ReadonlyArray<{ number?: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.number ?? 0), 0) + 1;
}

export function nodeLabel(node: Pick<StructuralNode, 'id' | 'number'> | undefined): string {
  return node?.number ? `N${node.number}` : node?.id ?? '?';
}

export function memberLabel(member: Pick<Member, 'id' | 'number'> | undefined): string {
  return member?.number ? `M${member.number}` : member?.id ?? '?';
}
