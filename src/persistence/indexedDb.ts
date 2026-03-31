import { get, set } from 'idb-keyval';
import type { ProjectModel } from '../core/model/types';

const PROJECT_KEY = '2d-frame-project';

export async function saveProject(model: ProjectModel): Promise<void> {
  await set(PROJECT_KEY, {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    model,
  });
}

export async function loadProject(): Promise<ProjectModel | null> {
  const data = await get(PROJECT_KEY);
  if (data && typeof data === 'object' && 'model' in data) {
    return (data as { model: ProjectModel }).model;
  }
  return null;
}
