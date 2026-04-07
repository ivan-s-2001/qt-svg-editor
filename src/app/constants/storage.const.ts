/**
 * LocalStorage key constants
 */
export const STORAGE = {
  STORED_PATHS: 'storedPaths',
  CONFIG_PREFIX: 'SaveDecorator',
  HALL_HTML: 'qtSvgEditor.hallHtml'
} as const;

export function getConfigKey(className: string, propertyKey: string): string {
  return `${STORAGE.CONFIG_PREFIX}.${className}.${propertyKey}`;
}
