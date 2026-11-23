// RFC 4180 CSV with spreadsheet-formula neutralization: a cell starting with = + - @ (or a tab
// or carriage return) is prefixed with an apostrophe so Excel and Sheets treat it as text.
const formula = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  let text = String(value);
  // Numbers are data, not formulas: a negative amount stays numeric.
  if (typeof value !== 'number' && formula.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) || text.startsWith("'") ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
