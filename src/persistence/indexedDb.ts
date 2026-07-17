import { get, set } from 'idb-keyval';
import type { ProjectModel } from '../core/model/types';
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  parseProjectFile,
  type ProjectFileImportResult,
} from '../io/projectFileParser';

const PROJECT_KEY = '3d-frame-project';

export async function saveProject(model: ProjectModel): Promise<void> {
  await set(PROJECT_KEY, {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    model,
  });
}

/** Load, validate, and migrate the autosave while retaining migration warnings. */
export async function loadProjectWithReport(): Promise<ProjectFileImportResult | null> {
  const data = await get(PROJECT_KEY);
  if (data == null) return null;
  return parseProjectFile(data);
}

/** Compatibility wrapper for callers that only need the restored model. */
export async function loadProject(): Promise<ProjectModel | null> {
  return (await loadProjectWithReport())?.model ?? null;
}
