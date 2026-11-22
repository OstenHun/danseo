import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { getDocumentProxy } from 'unpdf';
import type { SelectedPaper } from './topic.js';

export const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export async function pdfBytes(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > 64 * 1024 * 1024)
    throw Error('Provide a regular PDF file of at most 64 MiB.');
  return readFile(path);
}

const words = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/gu, '')
    .match(/[\p{L}\p{N}]+/gu) ?? [];
const compact = (text: string) => words(text).join('');

export const editionKey = (label: string) => words(label).join(' ');

export type Edition = { edition: string; proof: string; page: number; draft: boolean };

// A verified arXiv ID can disambiguate a catalogue title with an omitted subtitle.
function matchesTitle(paper: SelectedPaper, block: string, sameArxiv: boolean) {
  const actual = compact(block);
  if (actual && actual === compact(paper.title)) return true;
  const colon = paper.title.indexOf(':');
  return (
    sameArxiv &&
    colon > 0 &&
    !!compact(paper.title.slice(colon + 1)) &&
    actual.startsWith(compact(paper.title.slice(0, colon))) &&
    actual.endsWith(compact(paper.title.slice(colon + 1)))
  );
}

function withoutBibliographicHeader(block: string, runs: string[]) {
  let proceedings = false;
  for (const run of runs) {
    const text = run.normalize('NFKC').replace(/['’]/gu, '').trim();
    if (/^proceedings of\b/i.test(text)) proceedings = true;
    else if (
      !/^(?:doi\s*:|https?:\/\/doi\.org\/)/i.test(text) &&
      !(
        proceedings &&
        (/^,?\s*pages\s+\d+(?:\s*[-–]\s*\d+)?$/i.test(text) ||
          /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:[-–]\d{1,2})?,?\s+\d{4}\s*(?:©|\(c\)|copyright)\s*\d{4}\s+Association for Computational Linguistics\.?$/i.test(
            text,
          ))
      )
    )
      break;
    // Publisher footers can appear first in extraction order. Consume only
    // identified components, never an arbitrary prefix or title fragment.
    block = block.trimStart().slice(text.length).trimStart();
  }
  return block;
}

async function readPageRuns(pdf: Awaited<ReturnType<typeof getDocumentProxy>>, pageNumber: number) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.flatMap((item) => ('str' in item && item.str.trim() ? [item] : []));
}

function matchCoverArxivStamp(
  paper: SelectedPaper,
  cover: Awaited<ReturnType<typeof readPageRuns>>,
) {
  // A repository stamp is a standalone cover marking, not a citation inside an abstract.
  const stampPattern =
    /^\s*arxiv\s*:\s*((?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})v\d+)(?:\s+\[[\w.-]+\])?(?:\s+\d{1,2}\s+[a-z]+\s+\d{4})?\s*$/i;
  const stamp = cover.flatMap((item) => {
    const match = item.str.match(stampPattern);
    const rotated = Math.abs(item.transform[1]) > Math.abs(item.transform[0]);
    const dated = /\[.+\]\s+\d{1,2}\s+[a-z]+\s+\d{4}\s*$/i.test(item.str);
    return match && (rotated || dated) ? [match[1]!.toLowerCase()] : [];
  })[0];
  const idPattern = /^(?:arxiv:\s*)?((?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7}))(?:v\d+)?$/i;
  const url = new URL(paper.source);
  const urlId = /^(?:[\w-]+\.)?arxiv\.org$/i.test(url.hostname)
    ? url.pathname
        .replace(/^\/(?:abs|pdf)\//, '')
        .replace(/\.pdf$/, '')
        .match(idPattern)?.[1]
    : undefined;
  const selectedIds = [paper.key.match(idPattern)?.[1], urlId].filter(Boolean);
  const hasSelectedIds = selectedIds.length > 0;
  const matchesSelectedIds =
    !!stamp &&
    hasSelectedIds &&
    selectedIds.every((id) => id!.toLowerCase() === stamp.replace(/v\d+$/, ''));
  return { stamp, hasSelectedIds, matchesSelectedIds };
}

function verifyCoverIdentity(paper: SelectedPaper, runs: string[], sameArxiv: boolean) {
  const abstract = runs.findIndex(
    (run, index) => index > 0 && /^(?:abstract|초록)\s*[:.]?$/iu.test(run.trim()),
  );
  const frontRuns = (abstract < 0 ? runs : runs.slice(0, abstract)).map((run) =>
    run.normalize('NFKC').replace(/['’]/gu, ''),
  );
  const front = frontRuns.join(' ').slice(0, 6500);
  const authors = paper.authors
    .replace(/\s*(?:외(?:\s*\d+\s*명)?|et\s+al\.?)\s*$/iu, '')
    .split(/\s*(?:[,;&]|\band\b)\s*/iu)
    .filter(Boolean);
  const authorTokens = authors.map(words);
  const exactMatches = authorTokens.map((tokens) =>
    tokens.length
      ? new RegExp(
          '(?<![\\p{L}\\p{N}])' + tokens.join('[^\\p{L}\\p{N},;&]*') + '(?![\\p{L}\\p{N}])',
          'iu',
        ).exec(front)
      : null,
  );
  const exact = exactMatches.map((match) => match?.index ?? -1);
  const known = exact.filter((index) => index >= 0);
  if (!known.length)
    throw Error('Unable to match the first-page authors with the selected authors.');
  // Establish the complete title using an exact coauthor before permitting
  // omitted initials. A title fragment that resembles a name is not proof.
  const titleEnd = Math.min(...known);
  const titleBlock = front.slice(0, titleEnd);
  const withoutHeader = withoutBibliographicHeader(titleBlock, runs);
  const titleMatches = matchesTitle(paper, titleBlock, sameArxiv);
  if (!titleMatches && !matchesTitle(paper, withoutHeader, sameArxiv)) {
    throw Error('The first-page title differs from the selected title.');
  }
  const occupied = exactMatches.flatMap((match) =>
    match ? [{ start: match.index, end: match.index + match[0].length }] : [],
  );
  const byline = authorTokens.map((tokens, index) => {
    if (exact[index]! >= 0 || tokens.length !== 2 || tokens.some((token) => token.length < 2))
      return exact[index]!;
    // Match a complete name item after the verified title boundary; never
    // assemble a name from adjacent authors or earlier title lines.
    const initials = new RegExp(
      '^\\s*' + tokens.join('(?:\\s+[a-z]\\.?){1,3}\\s+') + '\\s*[,;]?\\s*$',
      'iu',
    );
    let offset = 0;
    for (const run of frontRuns) {
      if (offset + run.length > front.length) break;
      if (
        offset >= titleEnd &&
        !occupied.some((range) => range.start < offset + run.length && offset < range.end) &&
        initials.test(run)
      ) {
        const position = offset + run.search(/\S/u);
        occupied.push({ start: offset, end: offset + run.length });
        return position;
      }
      offset += run.length + 1;
    }
    return -1;
  });
  if (byline.some((index) => index < 0))
    throw Error('Unable to match the first-page authors with the selected authors.');
  const bibliographicHeader = titleMatches
    ? ''
    : titleBlock.slice(0, titleBlock.length - withoutHeader.length);
  return { titleBlock, bibliographicHeader };
}

function verifyUnstampedEdition(
  paper: SelectedPaper,
  evidence: Edition,
  cover: Awaited<ReturnType<typeof readPageRuns>>,
  identity: ReturnType<typeof verifyCoverIdentity>,
  quote: string,
) {
  if (/^arxiv:/i.test(evidence.edition))
    throw Error('Unable to verify this arXiv edition on the first page.');
  const edition = editionKey(evidence.edition);
  if (!edition || !(' ' + quote + ' ').includes(' ' + edition + ' ')) {
    throw Error('The edition name must appear in the evidence on the specified page.');
  }
  // Proof may quote a venue also printed on an author manuscript. Check cover markings
  // outside the paper title, including footer markings after the abstract.
  const label =
    /\b(?:draft|pre[ -]?print|author(?:['’]s)?\s+(?:accepted\s+)?manuscript|accepted manuscript|submitted (?:manuscript|to)|under review)\b|초고|투고본|심사본/i;
  const explicitStatus =
    /^(?:this (?:paper|article|version) is (?:an? )?(?:draft|pre[ -]?print)|author(?:['’]s)?\s+(?:accepted\s+)?manuscript|accepted manuscript|submitted (?:manuscript|to)|under review)\b/i;
  const versionLabel =
    /^(?:(?:working|preliminary|first|final)\s+)?(?:draft|pre[ -]?print|초고|투고본|심사본)(?:$|\s+v(?:ersion)?\s*\d|\s*[-:—(])/i;
  // Only status labels and standalone markings describe this document. Running
  // prose in the abstract can discuss a different preprint.
  const lines: string[] = [];
  for (const [index, item] of cover.entries()) {
    const prior = cover[index - 1];
    if (prior && !prior.hasEOL && Math.abs(item.transform[5] - prior.transform[5]) < 1) {
      lines[lines.length - 1] += ' ' + item.str;
    } else lines.push(item.str);
  }
  const draft =
    label.test([identity.bibliographicHeader, evidence.edition, evidence.proof].join(' ')) ||
    lines.some(
      (line) =>
        !identity.titleBlock.includes(line) &&
        (explicitStatus.test(line.trim()) || versionLabel.test(line.trim())),
    );
  if (!evidence.draft && (edition !== editionKey(paper.edition) || draft)) {
    throw Error('The edition differs from the selection. Register a substitute draft as a draft.');
  }
}

export async function verifyPdf(bytes: Buffer, paper: SelectedPaper, evidence: Edition) {
  if (
    bytes.subarray(0, 5).toString() !== '%PDF-' ||
    !/%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1'))
  ) {
    throw Error(
      'The PDF header or end marker is missing. Check for abstract HTML or an interrupted download.',
    );
  }
  const pdf = await getDocumentProxy(new Uint8Array(bytes), {
    stopAtErrors: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const cover = await readPageRuns(pdf, 1);
    const runs = cover.map((item) => item.str);
    const first = runs.join(' ');
    const { stamp, hasSelectedIds, matchesSelectedIds } = matchCoverArxivStamp(paper, cover);
    const identity = verifyCoverIdentity(paper, runs, matchesSelectedIds);
    const text =
      evidence.page === 1
        ? first
        : (await readPageRuns(pdf, evidence.page)).map((item) => item.str).join(' ');
    const quote = words(evidence.proof).join(' ');
    if (!quote || !(' ' + words(text).join(' ') + ' ').includes(' ' + quote + ' ')) {
      throw Error('No edition evidence was found on the specified page.');
    }
    if (stamp) {
      if (
        evidence.edition.toLowerCase() !== 'arxiv:' + stamp ||
        !evidence.proof.toLowerCase().includes(stamp) ||
        (hasSelectedIds && !matchesSelectedIds)
      ) {
        throw Error('Record the exact arXiv paper ID and v-number in the edition and evidence.');
      }
      if (!evidence.draft)
        throw Error('Register an arXiv source as a draft and obtain a decision for this edition.');
    } else {
      verifyUnstampedEdition(paper, evidence, cover, identity, quote);
    }
  } finally {
    await pdf.loadingTask.destroy();
  }
}
