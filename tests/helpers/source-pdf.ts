// One real text page with an xref table; a renamed text file cannot exercise PDF parsing.
export function pdf(
  title: string | string[],
  author: string,
  edition: string | string[],
  footer: string[] = [],
  lateFooter = '',
): Buffer {
  const leadingFooter = footer.map(
    (line, index) => `1 0 0 1 20 ${55 - 12 * index} Tm (${line}) Tj `,
  );
  const trailingFooter = lateFooter ? ` 1 0 0 1 20 18 Tm (${lateFooter}) Tj` : '';
  const content = `BT /F 12 Tf ${leadingFooter.join('')}1 0 0 1 20 730 Tm ${[title]
    .flat()
    .map((line) => `(${line}) Tj`)
    .join(' 0 -20 Td ')} 0 -20 Td (${author}) Tj ${[edition]
    .flat()
    .map((line) => `0 -20 Td (${line}) Tj`)
    .join(' ')}${trailingFooter} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let data = '%PDF-1.4\n';
  const offsets = [];
  for (const [i, obj] of objects.entries()) {
    offsets.push(data.length);
    data += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = data.length;
  data +=
    'xref\n0 6\n0000000000 65535 f \n' +
    offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(data + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
