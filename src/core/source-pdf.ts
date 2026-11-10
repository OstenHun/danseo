import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { getDocumentProxy } from 'unpdf';
import type { SelectedPaper } from './topic.js';

export const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export async function pdfBytes(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > 64 * 1024 * 1024) throw Error('64 MiB 이하의 일반 PDF 파일을 제공하세요.');
  return readFile(path);
}

const words = (text: string) => text.normalize('NFKC').toLowerCase()
  .replace(/['’]/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [];
const compact = (text: string) => words(text).join('');

export type Edition = { edition: string; proof: string; page: number; draft: boolean };

// A verified arXiv ID can disambiguate a catalogue title with an omitted subtitle.
function matchesTitle(paper: SelectedPaper, block: string, sameArxiv: boolean) {
  const actual = compact(block);
  if (actual && actual === compact(paper.title)) return true;
  const colon = paper.title.indexOf(':');
  return sameArxiv && colon > 0 && !!compact(paper.title.slice(colon + 1)) &&
    actual.startsWith(compact(paper.title.slice(0, colon))) && actual.endsWith(compact(paper.title.slice(colon + 1)));
}

export async function verifyPdf(bytes: Buffer, paper: SelectedPaper, evidence: Edition) {
  if (bytes.subarray(0, 5).toString() !== '%PDF-' || !/%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1'))) {
    throw Error('PDF 헤더 또는 끝 표시가 없습니다. 초록 HTML이나 중단된 다운로드인지 확인하세요.');
  }
  const pdf = await getDocumentProxy(new Uint8Array(bytes), {
    stopAtErrors: true, useSystemFonts: false, verbosity: 0
  });
  try {
    const pageRuns = async (number: number) => {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      return content.items.flatMap(item => 'str' in item && item.str.trim() ? [item.str] : []);
    };
    const runs = await pageRuns(1);
    const first = runs.join(' ');
    // A repository stamp is a standalone cover marking, not a citation inside an abstract.
    const stampPattern = /^\s*arxiv\s*:\s*((?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})v\d+)(?:\s+\[[\w.-]+\])?(?:\s+\d{1,2}\s+[a-z]+\s+\d{4})?\s*$/i;
    const stamp = runs.map(run => run.match(stampPattern)?.[1]).find(Boolean)?.toLowerCase();
    const idPattern = /^(?:arxiv:\s*)?((?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7}))(?:v\d+)?$/i;
    const url = new URL(paper.source);
    const urlId = /^(?:[\w-]+\.)?arxiv\.org$/i.test(url.hostname)
      ? url.pathname.replace(/^\/(?:abs|pdf)\//, '').replace(/\.pdf$/, '').match(idPattern)?.[1] : undefined;
    const ids = [paper.key.match(idPattern)?.[1], urlId].filter(Boolean);
    const sameArxiv = !!stamp && ids.length > 0 && ids.every(id => id!.toLowerCase() === stamp.replace(/v\d+$/, ''));
    const abstract = runs.findIndex((run, index) => index > 0 && /^(?:abstract|초록)\s*[:.]?$/iu.test(run.trim()));
    const front = (abstract < 0 ? runs : runs.slice(0, abstract)).join(' ').slice(0, 6500).normalize('NFKC').replace(/['’]/gu, '');
    const authors = paper.authors.replace(/\s*(?:외(?:\s*\d+\s*명)?|et\s+al\.?)\s*$/iu, '')
      .split(/\s*(?:[,;&]|\band\b)\s*/iu).filter(Boolean);
    const byline = authors.map(name => {
      const tokens = words(name);
      if (!tokens.length) return -1;
      return front.search(new RegExp('(?<![\\p{L}\\p{N}])' + tokens.join('[^\\p{L}\\p{N}]*') + '(?![\\p{L}\\p{N}])', 'iu'));
    });
    if (!byline.length || byline.some(index => index < 0)) throw Error('첫 쪽 저자 표기와 선택 당시 저자를 대조할 수 없습니다.');
    if (!matchesTitle(paper, front.slice(0, Math.min(...byline)), sameArxiv)) {
      throw Error('첫 쪽 제목과 선택 당시 제목이 일치하지 않습니다.');
    }
    const text = evidence.page === 1 ? first : (await pageRuns(evidence.page)).join(' ');
    const quote = words(evidence.proof).join(' ');
    if (!quote || !(' ' + words(text).join(' ') + ' ').includes(' ' + quote + ' ')) {
      throw Error('지정한 쪽에서 판본 근거를 찾지 못했습니다.');
    }
    const edition = words(evidence.edition).join(' ');
    if (stamp) {
      if (evidence.edition.toLowerCase() !== 'arxiv:' + stamp ||
          !evidence.proof.toLowerCase().includes(stamp) ||
          (ids.length > 0 && !sameArxiv)) {
        throw Error('arXiv 표기의 논문 ID와 실제 v번호를 판본 및 근거에 그대로 적으세요.');
      }
      if (!evidence.draft) throw Error('arXiv 원문은 초고로 등록하고 이 판본에 대한 결정을 받으세요.');
    } else {
      if (/^arxiv:/i.test(evidence.edition)) throw Error('첫 쪽에서 해당 arXiv 판본 표기를 확인할 수 없습니다.');
      const marked = ' ' + words(evidence.proof).join(' ') + ' ';
      if (!edition || !marked.includes(' ' + words(evidence.edition).join(' ') + ' ')) throw Error('판본 이름이 해당 쪽의 근거 표기에 포함되어야 합니다.');
      if (!evidence.draft && (edition !== words(paper.edition).join(' ') || /\b(?:draft|pre[ -]?print|accepted manuscript|author manuscript|submitted manuscript|under review)\b|초고|투고본|심사본|arxiv/i.test([front, evidence.edition, evidence.proof].join(' ')))) {
        throw Error('선택한 판본과 다릅니다. 대체 초고이면 초고로 등록하세요.');
      }
    }
  } finally { await pdf.loadingTask.destroy(); }
}
