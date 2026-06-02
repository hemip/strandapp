function stringValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function getInventoryYear(draft: Record<string, unknown>, fallbackDate = new Date()) {
  const explicitYear = stringValue(draft.ar) || stringValue(draft['år']) || stringValue(draft.inventeringsar);
  const yearMatch = explicitYear.match(/\d{4}/);
  if (yearMatch) {
    return yearMatch[0];
  }

  const dateValue = stringValue(draft.matstart);
  const dateYearMatch = dateValue.match(/^\d{4}/);
  if (dateYearMatch) {
    return dateYearMatch[0];
  }

  return String(fallbackDate.getFullYear());
}

export function createPlotFileBase(draft: Record<string, unknown>, fallbackDate = new Date()) {
  const year = getInventoryYear(draft, fallbackDate);
  const ruta = stringValue(draft.ruta).trim() || 'ruta';
  const provyta = stringValue(draft.provyta).trim();
  const normalizedProvyta = /^\d+$/.test(provyta) ? provyta.padStart(3, '0') : provyta || 'provyta';

  return `${year}${ruta}${normalizedProvyta}`;
}
