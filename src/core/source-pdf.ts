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

// Permit an inserted subtitle in a bibliographic title, but only inside the title block.
function matchesTitle(title: string, block: string) {
  const expected = words(title);
  let index = 0;
  for (const word of words(block)) if (word === expected[index]) index++;
  return expected.length > 0 && index === expected.length;
}

export async function verifyPdf(bytes: Buffer, paper: SelectedPaper, evidence: Edition) {
  if (bytes.subarray(0, 5).toString() !== '%PDF-' || !/%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1'))) {
    throw Error('PDF 헤더 또는 끝 표시가 없습니다. 초록 HTML이나 중단된 다운로드인지 확인하세요.');
  }
  const pdf = await getDocumentProxy(new Uint8Array(bytes), {
    stopAtErrors: true, useSystemFonts: false, verbosity: 0
  });
  try {
    const pageText = async (number: number) => {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      return content.items.map(item => 'str' in item ? item.str : '').join(' ');
    };
    const first = await pageText(1);
    const front = first.split(/\babstract\b|초록/iu)[0]!.slice(0, 6500);
    const authors = paper.authors.replace(/\s*(?:외(?:\s*\d+\s*명)?|et\s+al\.?)\s*$/iu, '').split(/\s*(?:[,;&]|\band\b)\s*/iu);
    const byline = compact(front);
    const firstAuthor = compact(authors[0]!);
    if (!firstAuthor || !authors.every(name => compact(name) && byline.includes(compact(name)))) {
      throw Error('첫 쪽 저자 표기와 선택 당시 저자를 대조할 수 없습니다.');
    }
    // Locate the author in the original text so that a title found only in body text cannot match.
    let bylineStart = front.length;
    const names = words(authors[0]!);
    const pattern = names.join('[^\\p{L}\\p{N}]*');
    if (pattern) bylineStart = front.normalize('NFKC').search(new RegExp(pattern, 'iu'));
    if (bylineStart < 0 || !matchesTitle(paper.title, front.normalize('NFKC').slice(0, bylineStart))) {
      throw Error('첫 쪽 제목과 선택 당시 제목이 일치하지 않습니다.');
    }
    const text = evidence.page === 1 ? first : await pageText(evidence.page);
    const quote = words(evidence.proof).join(' ');
    if (!quote || !(' ' + words(text).join(' ') + ' ').includes(' ' + quote + ' ')) {
      throw Error('지정한 쪽에서 판본 근거를 찾지 못했습니다.');
    }
    const stamp = first.match(/arxiv\s*:\s*(\d{4}\.\d{4,5}v\d+)\b/i)?.[1]?.toLowerCase();
    const edition = compact(evidence.edition);
    if (stamp) {
      if (evidence.edition.toLowerCase() !== 'arxiv:' + stamp ||
          !evidence.proof.toLowerCase().includes(stamp) ||
          (/^arxiv:/i.test(paper.key) && paper.key.toLowerCase() !== 'arxiv:' + stamp.replace(/v\d+$/, ''))) {
        throw Error('arXiv 표기의 논문 ID와 실제 v번호를 판본 및 근거에 그대로 적으세요.');
      }
      if (!evidence.draft) throw Error('arXiv 원문은 초고로 등록하고 이 판본에 대한 결정을 받으세요.');
    } else {
      const marked = ' ' + words(evidence.proof).join(' ') + ' ';
      if (!edition || !marked.includes(' ' + words(evidence.edition).join(' ') + ' ')) throw Error('판본 이름이 해당 쪽의 근거 표기에 포함되어야 합니다.');
      if (!evidence.draft && (edition !== compact(paper.edition) || /preprint|manuscript|submitted|초고|arxiv/i.test(evidence.proof))) {
        throw Error('선택한 판본과 다릅니다. 대체 초고이면 초고로 등록하세요.');
      }
    }
  } finally { await pdf.loadingTask.destroy(); }
}
