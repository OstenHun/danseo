import type { SelectedPaper } from './topic.js';
import { DanseoError } from './index.js';

type Candidate = Omit<SelectedPaper, 'number' | 'round' | 'note'>;
type Fields = Map<string, string[]>;
const doiPattern = /^10\.\d{4,9}\/[^\s?#]+$/i;
const doiHost = /^(?:dx\.)?doi\.org$/i;
const arxivPattern = /^(?:arxiv:\s*)?((?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?)$/i;

function clean(value: string): string {
  return /^null$/i.test(value.trim()) ? '' : value.trim();
}

function webUrl(value: string): URL | undefined {
  if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return undefined;
  try {
    const url = new URL(value);
    return url.username || url.password ? undefined : url;
  } catch {
    return undefined;
  }
}

function decodeDoiPath(url: URL, record?: number) {
  try {
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    if (record !== undefined)
      throw new DanseoError('TOPIC', `RIS record ${record} has an invalid DOI URL.`);
    return undefined;
  }
}

function doiIdentifier(fields: Fields, urls: URL[], record: number) {
  const labels = tagValues(fields, 'DO').map((value) => {
    const url = webUrl(value);
    return url && doiHost.test(url.hostname)
      ? decodeDoiPath(url, record)
      : value.replace(/^doi:\s*/i, '');
  });
  for (const url of urls) if (doiHost.test(url.hostname)) labels.push(decodeDoiPath(url, record));
  const identifiers = new Set(labels.map((label) => (label ?? '').toLowerCase()));
  const doi = identifiers.values().next().value;
  if (identifiers.size > 1 || (doi !== undefined && !doiPattern.test(doi)))
    throw new DanseoError('TOPIC', `RIS record ${record} has an invalid or conflicting DOI.`);
  return doi;
}

function arxivIdentifier(url: URL) {
  if (!/^(?:[\w-]+\.)?arxiv\.org$/i.test(url.hostname)) return undefined;
  const path = url.pathname.match(/^\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/i)?.[1];
  return path?.match(arxivPattern)?.[1]?.toLowerCase();
}

function identityTitle(title: string) {
  return title.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function bibliographicIdentity(paper: Candidate) {
  const source = new URL(paper.source);
  const doiFromSource = doiHost.test(source.hostname) ? decodeDoiPath(source) : undefined;
  const doi = [paper.doi, doiFromSource, paper.key.replace(/^doi:\s*/i, '')].find(
    (value) => value !== undefined && doiPattern.test(value),
  );
  const arxiv = paper.arxiv ?? arxivIdentifier(source) ?? paper.key.match(arxivPattern)?.[1];
  return {
    key: paper.key,
    source: source.href,
    title: identityTitle(paper.title),
    doi: doi?.toLowerCase(),
    arxiv: arxiv?.toLowerCase().replace(/v\d+$/, ''),
  };
}

function sourceMetadata(fields: Fields, record: number) {
  const urls = tagValues(fields, 'UR').map((value) => {
    const url = webUrl(value);
    if (!url)
      throw new DanseoError('TOPIC', `RIS record ${record} has an invalid HTTP(S) source URL.`);
    return url;
  });
  const doi = doiIdentifier(fields, urls, record);
  const firstUrl = urls[0];
  const arxivIds = urls.map(arxivIdentifier).filter((id) => id !== undefined);
  const arxiv = arxivIds[0];
  if (new Set(arxivIds.map((id) => id.replace(/v\d+$/, ''))).size > 1)
    throw new DanseoError('TOPIC', `RIS record ${record} has conflicting arXiv identifiers.`);
  const source =
    firstUrl?.href ??
    (doi && `https://doi.org/${doi.split('/').map(encodeURIComponent).join('/')}`);
  if (!source) return undefined;
  const sourceArxiv = firstUrl && arxivIdentifier(firstUrl);
  return {
    key: doi ?? arxiv?.replace(/v\d+$/, '') ?? source,
    source,
    ...(doi ? { doi } : {}),
    ...(arxiv ? { arxiv } : {}),
    edition: sourceArxiv?.match(/v\d+$/) ? `arXiv:${sourceArxiv}` : null,
  };
}

function tagValues(fields: Fields, ...tags: string[]) {
  return tags.flatMap((tag) => fields.get(tag) ?? []).filter(Boolean);
}

function candidate(fields: Fields, record: number): Candidate {
  const first = (...tags: string[]) => tagValues(fields, ...tags)[0];
  const title = first('T1', 'TI', 'TT');
  const primaryAuthors = tagValues(fields, 'A1');
  const authors = (primaryAuthors.length ? primaryAuthors : tagValues(fields, 'AU'))
    .map((name) => name.replace(/^([^,]+),\s*([^,]+)$/, '$2 $1'))
    .join('; ');
  const year = Number(first('PY', 'Y1')?.match(/^\d{4}(?=$|[/ -])/)?.[0]);
  const metadata = sourceMetadata(fields, record);
  if (!title || !authors || !year || !metadata) {
    throw new DanseoError(
      'TOPIC',
      `RIS record ${record} needs a title, authors, year and a valid source URL or DOI.`,
    );
  }
  return {
    ...metadata,
    title,
    authors,
    year,
    reason: 'Imported bibliography',
    scope: 'bibliography',
  };
}

function invalidStructure(line: number): never {
  throw new DanseoError('TOPIC', `Invalid RIS record structure at line ${line}.`);
}

function appendField(fields: Fields, tag: string, value: string) {
  const values = fields.get(tag) ?? [];
  values.push(value);
  fields.set(tag, values);
}

function appendContinuation(fields: Fields, tag: string, line: string, index: number) {
  const values = fields.get(tag);
  if (!/^\s/.test(line) || !values) invalidStructure(index + 1);
  values[values.length - 1] = [values.at(-1), line.trim()].filter(Boolean).join(' ');
}

function closeRecord(fields: Fields | undefined, value: string, line: number, record: number) {
  if (!fields || value) invalidStructure(line);
  return candidate(fields, record);
}

export function parseRis(text: string, maxRecords: number): Candidate[] {
  const papers: Candidate[] = [];
  let fields: Fields | undefined;
  let previousTag = '';
  const lines = text.split(/\r\n|\n|\r/);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const field = /^([A-Z0-9]{2})\s{2}-\s*(.*)$/.exec(line);
    if (!field) {
      if (!fields) invalidStructure(index + 1);
      appendContinuation(fields, previousTag, line, index);
      continue;
    }
    const [, tag = '', raw = ''] = field;
    const value = clean(raw);
    previousTag = tag;
    if (tag === 'TY') {
      if (fields || !value) invalidStructure(index + 1);
      fields = new Map();
    } else if (tag === 'ER') {
      papers.push(closeRecord(fields, value, index + 1, papers.length + 1));
      if (papers.length > maxRecords)
        throw new DanseoError('TOPIC', `Import at most ${maxRecords} RIS records per round.`);
      fields = undefined;
    } else {
      if (!fields) invalidStructure(index + 1);
      appendField(fields, tag, value);
    }
  }
  if (fields || !papers.length) invalidStructure(lines.length);
  return papers;
}
