// Minimal, dependency-free CSV parser that handles quoted fields (with embedded
// commas/newlines) as well as plain comma-separated rows. Good enough for a
// two-column "barcode,name" product list exported from Excel or FRED Office Plus.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // skip, handled by \n
    } else {
      field += char;
    }
  }
  // Final field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export interface ParsedProductRow {
  barcode: string;
  name: string;
}

// Parses a CSV into { barcode, name } rows. Auto-detects a header row and
// picks the most likely barcode/name columns by header text, falling back to
// "first column = barcode, second column = name" when there's no header.
export function parseProductCsv(text: string): ParsedProductRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  let startIndex = 0;
  let barcodeCol = 0;
  let nameCol = 1;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const looksLikeHeader = header.some((h) => /barcode|upc|ean|sku|code/.test(h)) ||
    header.some((h) => /name|product|description|desc/.test(h));

  if (looksLikeHeader) {
    startIndex = 1;
    const barcodeIdx = header.findIndex((h) => /barcode|upc|ean|sku|code/.test(h));
    const nameIdx = header.findIndex((h) => /name|product|description|desc/.test(h));
    if (barcodeIdx !== -1) barcodeCol = barcodeIdx;
    if (nameIdx !== -1) nameCol = nameIdx;
  }

  const out: ParsedProductRow[] = [];
  for (let i = startIndex; i < rows.length; i++) {
    const r = rows[i];
    const barcode = (r[barcodeCol] ?? "").trim();
    const name = (r[nameCol] ?? "").trim();
    if (barcode && name) out.push({ barcode, name });
  }
  return out;
}
