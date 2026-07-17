import {
  isFrameJsonFormat,
  parseFrameJson,
  parseJsonText,
} from './frameJsonParser';
import {
  convertFrameJsonWithReport,
  type FrameJsonImportResult,
} from './frameJsonConverter';
import {
  parseProjectFile,
  type ProjectFileImportResult,
} from './projectFileParser';

export type JsonImportResult = FrameJsonImportResult | ProjectFileImportResult;

/**
 * Detect, parse, validate, and convert supported JSON formats with one
 * JSON.parse call. The detailed result is suitable for an import summary UI.
 */
export function importJsonTextAuto(
  text: string,
  frameJsonLoadCaseIndex?: number
): JsonImportResult {
  const parsed = parseJsonText(text);
  if (isFrameJsonFormat(parsed)) {
    return convertFrameJsonWithReport(parseFrameJson(parsed), frameJsonLoadCaseIndex);
  }
  return parseProjectFile(parsed);
}
