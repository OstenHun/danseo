import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate, renderCandidate } from './render-research-view.mjs';
import { performancePlan, performanceFields } from './performance-evidence.mjs';
import { overviewFor, verifyEvidence } from './research-evidence.mjs';
import { languageScript } from './view-language.mjs';
// Minimal DOM host for exercising the shipped browser script's observable contracts.
// Layout, native fragment scrolling and CSP still require the real browser checks.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function openView(data, initialHash, { script, elementIds, navigation, prefix, title, mapApi }) {
  const elements = new Map(),
    handlers = new Map();
  let hash = initialHash;
  const location = {
    get hash() {
      return hash;
    },
    set hash(value) {
      if (value === hash) return;
      hash = value;
      handlers.get('hashchange')?.();
    },
  };
  const document = { activeElement: null, getElementById: (id) => elements.get(id) };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attributes = new Map();
      this.events = new Map();
      this.dataset = {};
      this.disabled = false;
    }
    set id(value) {
      this._id = value;
      elements.set(value, this);
    }
    get id() {
      return this._id;
    }
    set textContent(value) {
      this.children = [String(value)];
    }
    get textContent() {
      return this.children
        .map((child) => (typeof child === 'string' ? child : child.textContent))
        .join('');
    }
    append(...children) {
      this.children.push(...children);
    }
    after(element) {
      this.nextElementSibling = element;
    }
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    }
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    addEventListener(name, handler) {
      this.events.set(name, handler);
    }
    focus() {
      document.activeElement = this;
    }
    click() {
      if (this.disabled) return;
      let prevented = false;
      this.events.get('click')?.({
        preventDefault() {
          prevented = true;
        },
      });
      if (!prevented && this.href?.startsWith('#')) location.hash = this.href;
    }
  }
  document.createElement = (tag) => new Element(tag);
  // The page's navigation buttons and skip link; every other element is a div.
  const tagFor = (id) => {
    if (['previous', 'next'].includes(id)) return 'button';
    return id === 'skip' ? 'a' : 'div';
  };
  for (const id of elementIds) {
    const element = new Element(tagFor(id));
    element.id = id;
  }
  elements.get('candidate').textContent = JSON.stringify(data);
  elements.get('skip').href = '#' + title;
  const presentation = readFileSync(
    new URL('../assets/graph-presentation.js', import.meta.url),
    'utf8',
  );
  runInNewContext(languageScript(data.language) + presentation + readFileSync(script, 'utf8'), {
    document,
    location,
    URL,
    window: {
      DanseoMap: mapApi,
      addEventListener(name, handler) {
        handlers.set(name, handler);
      },
    },
  });
  return {
    elements,
    location,
    get activeElement() {
      return document.activeElement;
    },
    select(id) {
      elements
        .get(navigation)
        .children.find((item) => item.children[0].href === prefix + encodeURIComponent(id))
        .children[0].click();
    },
  };
}

const elementIds = [
  'candidate',
  'skip',
  'items',
  'count',
  'position',
  'item-title',
  'metadata',
  'content',
  'previous',
  'next',
  'current-count',
  'announcement',
  'map-heading',
  'map-notice',
  'map-legend',
  'map-status',
  'scene-controls',
  'map-links',
  'provenance',
  'research-map',
  'map-node-navigation',
  'node-kind',
  'fit-map',
  'zoom-in',
  'zoom-out',
];
const fixture = (mode, version = 1) =>
  JSON.parse(
    readFileSync(
      new URL(
        '../assets/' + mode + (version === 2 ? '.v2' : '') + '.example.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
const openResearchPaper = (data, id) =>
  openView(data, '#paper=' + id, {
    script: new URL('../assets/research-view.js', import.meta.url),
    elementIds,
    navigation: 'items',
    prefix: data.mode === 'project-application' ? '#application=' : '#paper=',
    title: 'item-title',
  });
const openPaper = (data, id) => openResearchPaper(data, id).elements.get('content');

test('citation nodes grow on a bounded scale and keep a gap in the topic grid', () => {
  const window = {};
  runInNewContext(
    readFileSync(new URL('../assets/graph-presentation.js', import.meta.url), 'utf8'),
    { window },
  );
  const { card, nodeDimensions } = window.DanseoGraph;
  assert.equal(nodeDimensions(undefined).width, card.width);
  assert.equal(nodeDimensions(0).width, 156);
  assert.ok(nodeDimensions(25).width > nodeDimensions(0).width);
  assert.ok(nodeDimensions(150_000).height > nodeDimensions(25).height);
  assert.ok(nodeDimensions(150_000).width - nodeDimensions(687).width >= 35);
  assert.ok(nodeDimensions(150_000).width > nodeDimensions(99_434).width);
  assert.equal(nodeDimensions(150_000).width, nodeDimensions(Number.MAX_SAFE_INTEGER).width);
  assert.ok(nodeDimensions(150_000).width <= card.column - 12);
  assert.ok(nodeDimensions(150_000).height <= card.row - 12);
});

test('optional metrics preserve a measured zero and attribute venue ranks to their own scheme', () => {
  const data = fixture('paper-relations', 2);
  data.language = 'en';
  const [first, second] = data.papers;
  const sourceId = data.sources[0].id;
  data.sources.push(
    { ...data.sources[0], id: 'rank-icore', url: 'https://portal.core.edu.au/conf-ranks/98/' },
    { ...data.sources[0], id: 'rank-register', url: 'https://example.org/register' },
  );
  first.citations = { count: 0, checked_on: '2026-11-18', source_id: sourceId };
  first.venue_rank = {
    venue: 'Example Conference',
    scheme: 'ICORE',
    edition: '2026',
    rank: 'A*',
    top_tier: true,
    venue_source_id: sourceId,
    source_id: 'rank-icore',
  };
  second.venue_rank = {
    venue: 'Example Journal',
    scheme: 'Channel Register',
    edition: '2026',
    rank: 'Level 2',
    top_tier: false,
    venue_source_id: sourceId,
    source_id: 'rank-register',
  };
  validateCandidate(data);
  const firstView = openResearchPaper(data, first.id);
  const firstDetail = firstView.elements.get('content').textContent;
  assert.match(firstDetail, /Citations · 0 · checked 2026-11-18/);
  assert.match(firstDetail, /Example ConferenceICORE 2026A\*Top tier in this ranking/);
  assert.ok(firstDetail.includes(data.sources[0].title));
  const secondDetail = openPaper(data, second.id).textContent;
  assert.match(secondDetail, /Citation count unavailable/);
  assert.match(secondDetail, /Example JournalChannel Register 2026Level 2/);
  assert.doesNotMatch(secondDetail, /Top tier in this ranking/);
  // The same labels in Korean, in the order asserted above.
  const korean = { ...data, language: 'ko' };
  const koreanFirst = openResearchPaper(korean, first.id).elements.get('content').textContent;
  assert.match(koreanFirst, /인용 0회 · 2026-11-18 조회/);
  assert.match(koreanFirst, /Example ConferenceICORE 2026A\*이 평가 기준의 최상위 등급/);
  const koreanSecond = openPaper(korean, second.id).textContent;
  assert.match(koreanSecond, /인용수 미확인/);
  assert.doesNotMatch(koreanSecond, /최상위 등급/);
  const guide = firstView.elements.get('venue-guide');
  assert.deepEqual(
    guide.children.filter((child) => child.tagName === 'H3').map((child) => child.textContent),
    ['ICORE 2026', 'Channel Register 2026'],
  );
  const tables = guide.children.filter((child) => child.tagName === 'TABLE');
  const rowGrades = (table) => table.children[1].children.map((row) => row.children[0].textContent);
  assert.deepEqual(rowGrades(tables[0]), ['A*', 'A', 'B', 'C']);
  assert.deepEqual(rowGrades(tables[1]), ['Level 2']);
  assert.equal(
    tables[1].children[1].children[0].children[1].children[0].href,
    'https://example.org/register',
  );
  assert.match(firstView.elements.get('items').textContent, /ICORE A\*/);

  for (const count of [-1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = structuredClone(data);
    invalid.papers[0].citations.count = count;
    assert.throws(() => validateCandidate(invalid), /nonnegative safe integer/);
  }
  for (const date of ['2026-11', '2026-02-30']) {
    const invalid = structuredClone(data);
    invalid.papers[0].citations.checked_on = date;
    assert.throws(() => validateCandidate(invalid), /citations\.checked_on/);
  }
  for (const field of ['source_id', 'venue_source_id']) {
    const invalid = structuredClone(data);
    invalid.papers[0].venue_rank[field] = 'unknown';
    assert.throws(() => validateCandidate(invalid), /source must be registered/);
  }
});

test('reading reason comes first and additional ranks stay in the paper disclosure', () => {
  const data = fixture('paper-relations', 2);
  data.language = 'en';
  const paper = data.papers[0];
  const original = data.sources[0];
  const primarySource = {
    ...original,
    id: 'rank-icore',
    url: 'https://portal.core.edu.au/conf-ranks/98/',
  };
  const otherSource = {
    ...original,
    id: 'rank-ccf',
    title: 'CCF catalog',
    locator: 'p. 58',
    scope: 'Full papers only',
    url: 'https://example.org/ccf#page=58',
  };
  const otherVenue = {
    ...original,
    id: 'other-venue',
    title: 'Conference proceedings',
    locator: 'Main track, article 4',
    scope: 'Published edition',
    url: 'https://example.org/proceedings/4',
  };
  data.sources.push(primarySource, otherSource, otherVenue);
  paper.reading_reason = 'See how this method connects to later work.';
  paper.venue_rank = {
    venue: 'Example Conference',
    scheme: 'ICORE',
    edition: '2026',
    rank: 'A',
    top_tier: false,
    venue_source_id: original.id,
    source_id: primarySource.id,
  };
  paper.additional_venue_ranks = [
    { ...paper.venue_rank, scheme: 'CCF', rank: 'B', source_id: otherSource.id },
  ];
  validateCandidate(data);
  const view = openResearchPaper(data, paper.id);
  const content = view.elements.get('content');
  assert.equal(content.children[0].textContent, 'Why read this paper' + paper.reading_reason);
  assert.match(view.elements.get('items').textContent, /ICORE A/);
  assert.doesNotMatch(view.elements.get('items').textContent, /CCF/);
  assert.doesNotMatch(view.elements.get('venue-guide').textContent, /CCF/);
  const metrics = content.children.find(
    (child) => child.children[0]?.textContent === 'Venue ranking',
  );
  const disclosure = metrics.children.find(
    (child) => child.children?.[0]?.textContent === 'Other venue rankings',
  );
  assert.equal(disclosure.tagName, 'DETAILS');
  assert.match(disclosure.textContent, /CCF 2026BCCF catalog · p\. 58/);
  assert.match(disclosure.textContent, /Full papers only/);
  assert.equal(disclosure.children[1].children.at(-1).href, otherSource.url);
  // The same headings in Korean: "Why read this paper", "Venue ranking" and "Other venue rankings".
  const korean = openResearchPaper({ ...data, language: 'ko' }, paper.id).elements.get('content');
  assert.equal(korean.children[0].textContent, '이 논문을 읽을 이유' + paper.reading_reason);
  const koreanMetrics = korean.children.find(
    (child) => child.children[0]?.textContent === '게재처 등급',
  );
  assert.ok(
    koreanMetrics.children.some((child) => child.children?.[0]?.textContent === '추가 게재처 등급'),
  );
  const fields = performanceFields(data);
  assert.equal(fields.get('/papers/0/reading_reason').value, paper.reading_reason);

  primarySource.url = null;
  paper.additional_venue_ranks[0].venue_source_id = otherVenue.id;
  const withoutPrimary = openPaper(data, paper.id);
  assert.match(withoutPrimary.textContent, /Representative rank unverified/);
  // "Representative rank unverified" and "Other venue rankings" in Korean.
  const koreanWithoutPrimary = openPaper({ ...data, language: 'ko' }, paper.id).textContent;
  assert.match(koreanWithoutPrimary, /대표 등급 미확인/);
  assert.match(koreanWithoutPrimary, /추가 게재처 등급/);
  assert.match(withoutPrimary.textContent, /Other venue rankings/);
  const extra = withoutPrimary.children
    .find((child) => child.children[0]?.textContent === 'Venue ranking')
    .children.find((child) => child.children[0]?.textContent === 'Other venue rankings')
    .children[1];
  assert.ok(extra.children.some((child) => child.href === otherSource.url));
  const publication = extra.children.find((child) => child.tagName === 'DETAILS');
  assert.match(publication.textContent, /Main track, article 4/);
  assert.match(publication.textContent, /Published edition/);
  assert.equal(publication.children.at(-1).href, otherVenue.url);
  primarySource.url = 'https://portal.core.edu.au/conf-ranks/98/';

  const duplicate = structuredClone(data);
  duplicate.papers[0].additional_venue_ranks.push({
    ...paper.venue_rank,
    scheme: 'icore',
    rank: 'B',
    source_id: otherSource.id,
  });
  assert.throws(
    () => validateCandidate(duplicate),
    /duplicate venue, scheme, edition and category/,
  );
  otherSource.url = null;
  assert.doesNotMatch(openPaper(data, paper.id).textContent, /Other venue rankings/);
  assert.doesNotMatch(
    openPaper({ ...data, language: 'ko' }, paper.id).textContent,
    /추가 게재처 등급/,
  );
  const invalid = structuredClone(data);
  invalid.papers[0].additional_venue_ranks[0].source_id = 'missing';
  assert.throws(
    () => validateCandidate(invalid),
    /additional_venue_ranks\[0\]\.source_id: source must be registered/,
  );
  delete paper.venue_rank;
  assert.throws(() => validateCandidate(data), /expected a representative venue_rank/);
});

test('JCR uses all four localized quartiles while other Q labels retain their scheme', () => {
  const data = fixture('paper-relations', 2);
  const [jcr, other] = data.papers;
  const venue = data.sources[0];
  const jcrSource = { ...venue, id: 'rank-jcr', url: 'https://example.org/jcr' };
  const otherSource = { ...venue, id: 'rank-sjr', url: 'https://example.org/sjr' };
  data.sources.push(jcrSource, otherSource);
  const journal = {
    venue: 'Example Journal',
    edition: '2025',
    rank: 'Q2',
    top_tier: false,
    venue_source_id: venue.id,
  };
  jcr.venue_rank = {
    ...journal,
    scheme: 'JCR',
    source_id: jcrSource.id,
    category: 'Engineering, Electrical & Electronic',
    top_tier: true,
  };
  other.venue_rank = { ...journal, scheme: 'SCImago SJR', source_id: otherSource.id };
  validateCandidate(data);
  for (const language of ['ko', 'en']) {
    data.language = language;
    const view = openResearchPaper(data, jcr.id);
    const guide = view.elements.get('venue-guide');
    const [quartiles, generic] = guide.children.filter((child) => child.tagName === 'TABLE');
    const quartileRows = quartiles.children[1].children;
    assert.deepEqual(
      quartileRows.map((row) => row.children[0].textContent),
      ['Q1', 'Q2', 'Q3', 'Q4'],
    );
    assert.deepEqual(
      quartileRows.map((row) => row.children[0].children[0].dataset.grade),
      ['Q1', 'Q2', 'Q3', 'Q4'],
    );
    assert.equal(
      quartileRows[0].children[1].textContent,
      language === 'ko' ? '상위 25% 이내' : 'Top 25% of the category by JIF rank',
    );
    assert.equal(
      quartileRows[3].children[1].textContent,
      language === 'ko' ? '하위 25% 구간' : 'Below the top 75% by JIF rank',
    );
    assert.ok(
      guide.children.some(
        (child) =>
          child.tagName === 'A' && child.href.startsWith('https://supportcenter.clarivate.com/'),
      ),
    );
    const genericRows = generic.children[1].children;
    assert.equal(genericRows.length, 1);
    assert.equal(genericRows[0].children[0].children[0].dataset.grade, undefined);
    assert.equal(genericRows[0].children[1].children[0].href, otherSource.url);
    const detail = view.elements.get('content').textContent;
    assert.match(detail, /JCR 2025Q2/);
    assert.ok(detail.includes('Engineering, Electrical & Electronic'));
    assert.doesNotMatch(detail, /Top tier|최상위 등급/);
  }
  jcr.venue_rank.category = ' ';
  assert.throws(() => validateCandidate(data), /venue_rank.category/);
  delete jcr.venue_rank.category;
  assert.match(openPaper(data, jcr.id).textContent, /JCR subject category unreported/);
  jcr.venue_rank.rank = 'Q5';
  assert.match(openPaper(data, jcr.id).textContent, /Rank unverified/);
  jcr.venue_rank.rank = 'Q2';
  jcrSource.url = null;
  assert.match(openPaper(data, jcr.id).textContent, /Rank unverified/);
});

test('Norwegian Register guide starts with the highest level and preserves observed sources', () => {
  const data = fixture('paper-relations', 2);
  const [first, second] = data.papers;
  const [venue] = data.sources;
  const source = {
    ...venue,
    id: 'norwegian-rank',
    url: 'https://kanalregister.hkdir.no/tidsskrift?id=445791',
  };
  const otherSource = {
    ...venue,
    id: 'norwegian-other-rank',
    url: 'https://kanalregister.hkdir.no/tidsskrift?id=2',
  };
  data.sources.push(source, otherSource);
  first.venue_rank = {
    venue: 'Example Journal',
    scheme: 'Norwegian Register',
    edition: '2026',
    rank: 'Level 2',
    top_tier: false,
    venue_source_id: venue.id,
    source_id: source.id,
  };
  second.venue_rank = {
    ...first.venue_rank,
    rank: 'Level 0',
    top_tier: true,
    source_id: otherSource.id,
  };
  validateCandidate(data);
  for (const language of ['en', 'ko']) {
    data.language = language;
    const view = openResearchPaper(data, first.id);
    const guide = view.elements.get('venue-guide');
    const table = guide.children.find((child) => child.tagName === 'TABLE');
    const [level2, level1, other] = table.children[1].children;
    assert.deepEqual(
      table.children[1].children.map((row) => row.children[0].textContent),
      ['Level 2', 'Level 1', 'Level 0'],
    );
    assert.equal(level1.children[0].children[0].dataset.grade, 'Level 1');
    assert.equal(level2.children[0].children[0].dataset.grade, 'Level 2');
    assert.equal(other.children[0].children[0].dataset.grade, 'status');
    assert.equal(
      level1.children[1].textContent,
      language === 'ko'
        ? '기본 요건을 충족해 승인된 학술 출판처'
        : 'Approved academic publication venue meeting the basic criteria',
    );
    assert.equal(
      level2.children[1].children[0].textContent,
      language === 'ko'
        ? '최상위 등급으로 승인된 학술 출판처'
        : 'Academic publication venue approved at the highest level',
    );
    assert.equal(level2.children[1].children[1].href, source.url);
    assert.equal(
      other.children[1].children[0].textContent,
      language === 'ko'
        ? '학술 출판처로 승인되지 않음'
        : 'Not approved as an academic publication venue',
    );
    assert.equal(other.children[1].children[1].href, otherSource.url);
    assert.match(view.elements.get('content').textContent, /Top tier|최상위 등급/);
    assert.doesNotMatch(openPaper(data, second.id).textContent, /Top tier|최상위 등급/);
    assert.equal(
      guide.children.find((child) => child.tagName === 'A').href,
      'https://kanalregister.hkdir.no/en/informasjonsartikler/levels-and-changes-in-levels',
    );
  }
});

test('unverified venues have no scheme in the guide or grade in the paper detail', () => {
  const data = fixture('paper-relations', 2);
  data.language = 'en';
  const [paper] = data.papers;
  const [venue] = data.sources;
  const ranking = { ...venue, id: 'rank-icore', url: null };
  data.sources.push(ranking);
  paper.venue_rank = {
    venue: 'Example Conference',
    scheme: 'ICORE',
    edition: '2026',
    rank: 'A*',
    top_tier: true,
    venue_source_id: venue.id,
    source_id: ranking.id,
  };
  for (const url of [
    null,
    'https://example.org/claimed-icore',
    'https://portal.core.edu.au/conf-ranks/',
  ]) {
    ranking.url = url;
    validateCandidate(data);
    const view = openResearchPaper(data, paper.id);
    assert.match(view.elements.get('content').textContent, /Rank unverified/);
    assert.match(view.elements.get('items').textContent, /Rank unverified/);
    assert.doesNotMatch(view.elements.get('venue-guide').textContent, /ICORE 2026/);
  }
  ranking.url = 'https://portal.core.edu.au/conf-ranks/98/';
  paper.venue_rank.rank = 'A';
  assert.doesNotMatch(openPaper(data, paper.id).textContent, /Top tier/);
  for (const designation of ['Australasian B', 'Australasian C', 'Unranked']) {
    paper.venue_rank.rank = designation;
    const view = openResearchPaper(data, paper.id);
    assert.ok(view.elements.get('content').textContent.includes(designation));
    const supplemental = view.elements
      .get('venue-guide')
      .children.find((child) => child.tagName === 'TABLE')
      .children[1].children.at(-1);
    assert.equal(supplemental.children[1].children[1].href, ranking.url);
  }
  paper.venue_rank.rank = 'A+';
  assert.match(openPaper(data, paper.id).textContent, /Rank unverified/);
  paper.venue_rank.rank = 'A';
  venue.url = null;
  assert.match(openPaper(data, paper.id).textContent, /Rank unverified/);
});

test('project-application paper details use the same venue source checks as paper maps', () => {
  const data = fixture('project-application');
  const [paper] = data.papers;
  const [venue] = data.sources;
  const rankSource = { ...venue, id: 'ranking-record', url: 'https://example.org/claimed-icore' };
  data.sources.push(rankSource);
  paper.venue_rank = {
    venue: 'Example Conference',
    scheme: 'ICORE',
    edition: '2026',
    rank: 'A*',
    top_tier: true,
    venue_source_id: venue.id,
    source_id: rankSource.id,
  };
  assert.match(openPaper(data, paper.id).textContent, /Rank unverified/);
  assert.doesNotMatch(openPaper(data, paper.id).textContent, /Top tier/);
  rankSource.url = 'https://portal.core.edu.au/conf-ranks/98/';
  assert.match(openPaper(data, paper.id).textContent, /Top tier/);
});

test('paper details show distinct sourced publication and edition dates without a publication-like draft badge', () => {
  for (const language of ['en', 'ko']) {
    const data = fixture('paper-relations', 2);
    data.language = language;
    data.papers[0].publication = {
      date: '2017-06-12',
      edition_date: '2023-08-02',
      source_id: data.sources[0].id,
    };
    const view = openView(data, '#paper=' + data.papers[0].id, {
      script: new URL('../assets/research-view.js', import.meta.url),
      elementIds,
      navigation: 'items',
      prefix: '#paper=',
      title: 'item-title',
    });
    const metadata = view.elements.get('metadata').textContent;
    assert.match(metadata, /2017-06-12/);
    assert.match(metadata, /2023-08-02/);
    assert.doesNotMatch(metadata, /draft|review in progress|검토 중/);
    assert.ok(metadata.includes(language === 'ko' ? '최초 공개' : 'First published'));
  }
});

test('Korean completed coverage and a single authorship notice are rendered as visible UI text', () => {
  const data = fixture('paper-relations', 2);
  data.language = 'ko';
  const html = renderCandidate(data, {
    complete: true,
    completionScope: 'Only <selected> source passages, not full papers.',
  });
  // "A completed comparison record exists for the included claims and source relations." The
  // negative check below covers "recorded by AI", "AI commentary" and "AI suggestion".
  assert.match(
    html,
    /<p class="description source-coverage">수록한 주장과 원문 관계의 대조 완료 기록이 있습니다\.<\/p>/,
  );
  assert.match(html, /Only &lt;selected&gt; source passages, not full papers\./);
  assert.equal((html.match(/class="description authorship"/g) ?? []).length, 1);
  const view = openView(data, '#paper=' + data.papers[0].id, {
    script: new URL('../assets/research-view.js', import.meta.url),
    elementIds,
    navigation: 'items',
    prefix: '#paper=',
    title: 'item-title',
  });
  assert.doesNotMatch(view.elements.get('content').textContent, /AI가 기록한|AI 해설|AI 제안/);
});

test('stale Paper warnings survive draft-badge removal in legacy project and evidence-reference paths', () => {
  const data = fixture('project-application', 1);
  const paper = data.papers[0];
  paper.review_status = 'needs-recheck';
  const open = (hash) =>
    openView(data, hash, {
      script: new URL('../assets/research-view.js', import.meta.url),
      elementIds,
      navigation: 'items',
      prefix: '#application=',
      title: 'item-title',
    });
  for (const hash of [
    '#paper=' + paper.id,
    '#application=' + data.start,
    '#reference=' + data.start + ':' + paper.id,
  ]) {
    const view = open(hash);
    assert.match(
      view.elements.get('metadata').textContent + view.elements.get('content').textContent,
      /Evidence needs rechecking/,
    );
  }
});

test('local-only publication evidence retains its title, locator and scope without inventing a file URL', () => {
  const data = fixture('paper-relations', 2);
  const paper = data.papers[0];
  data.sources.push({
    id: 'S.local-dates',
    title: 'Local edition cover',
    url: null,
    locator: 'Cover, PDF p.1',
    scope: 'Checked cover date only.',
    verification: 'agent-checked',
  });
  paper.publication = { date: '2017', edition_date: null, source_id: 'S.local-dates' };
  paper.short_title = 'Synthetic conference label · 2019';
  const view = openView(data, '#paper=' + paper.id, {
    script: new URL('../assets/research-view.js', import.meta.url),
    elementIds,
    navigation: 'items',
    prefix: '#paper=',
    title: 'item-title',
  });
  const metadata = view.elements.get('metadata').textContent;
  assert.match(metadata, /First published · 2017/);
  assert.match(metadata, /Local edition cover/);
  assert.match(metadata, /Cover, PDF p.1/);
  assert.match(metadata, /Checked cover date only/);
  assert.doesNotMatch(metadata, /2019|file:/);
});
test('v2 authoring errors remain failures until required provenance and notes shapes are repaired', () => {
  const data = fixture('paper-relations', 2),
    provenance = data.provenance;
  delete data.provenance;
  assert.throws(() => validateCandidate(data), /missing provenance/);
  data.provenance = provenance;
  data.papers[0].notes = 'A paragraph is not an array.';
  assert.throws(() => validateCandidate(data), /paper.notes: expected array/);
  data.papers[0].notes = [data.papers[0].notes];
  validateCandidate(data);
});

test('relation reading separates AI references, absent evidence and source records in both languages', () => {
  for (const language of ['en', 'ko'])
    for (const origin of ['ai', 'source'])
      for (const linked of [true, false]) {
        const data = fixture('paper-relations', 2);
        data.language = language;
        const relation = data.relations[0];
        relation.origin = origin;
        relation.status = 'proposed';
        relation.review = null;
        if (!linked) relation.evidence_refs = [];
        const saved = JSON.stringify(data);
        const view = openView(data, '#relation=' + relation.id, {
          script: new URL('../assets/research-view.js', import.meta.url),
          elementIds,
          navigation: 'items',
          prefix: '#paper=',
          title: 'item-title',
        });
        const content = view.elements.get('content'),
          evidence = content.children[2];
        assert.equal(
          evidence.children[0].textContent,
          language === 'ko' ? '원문 근거' : 'Source evidence',
        );
        const aiReference =
          language === 'ko'
            ? '이 주장을 바탕으로 추천한 연결'
            : 'These claims inform a reading suggestion';
        assert.equal(evidence.textContent.includes(aiReference), origin === 'ai' && linked);
        if (!linked) {
          assert.equal(evidence.children.length, 2);
          assert.ok(
            evidence.textContent.includes(
              language === 'ko' ? '원문에서 확인된 관계로 사용하지 마세요.' : 'Do not use',
            ),
          );
          assert.equal(
            evidence.children[1].textContent.includes(language === 'ko' ? '추천' : 'suggestion'),
            origin === 'ai',
          );
        }
        assert.match(view.elements.get('position').textContent, /01 · /);
        const history = content.children.at(-1);
        assert.equal(history.tagName, 'DETAILS');
        assert.equal(history.children[0].tagName, 'SUMMARY');
        assert.ok(history.textContent.includes(relation.created_by));
        assert.equal(JSON.stringify(data), saved);
      }
});
for (const version of [1, 2])
  for (const language of ['en', 'ko']) {
    test(
      'relation v' +
        version +
        ' (' +
        language +
        ') shows linked originals and local locations before claim disclosures',
      () => {
        const data = fixture('paper-relations', version);
        data.language = language;
        const relation = data.relations[0];
        relation.kind = 'reading-order';
        relation.origin = 'ai';
        relation.status = 'proposed';
        relation.review = null;

        const paper = data.papers.find((paper) => paper.id === relation.source);
        const [claim] = paper.claims;
        const url = 'https://example.org/original.pdf?edition=2#page=7';
        const otherPage = 'https://example.org/original.pdf?edition=2#page=12';
        const otherPublisher = 'https://publisher.example/original.pdf#page=12';
        data.sources.push(
          {
            id: 'direct-a',
            title: 'Registered original',
            url,
            locator: 'Section 2',
            scope: 'Test',
          },
          { id: 'direct-b', title: 'Registered original', url, locator: 'Table 1', scope: 'Test' },
          {
            id: 'direct-page',
            title: 'Registered original',
            url: otherPage,
            locator: 'Appendix A',
            scope: 'Test',
          },
          {
            id: 'direct-publisher',
            title: 'Registered original',
            url: otherPublisher,
            locator: 'Appendix A',
            scope: 'Test',
          },
          {
            id: 'direct-local',
            title: 'Local PDF',
            url: null,
            locator: 'Appendix B',
            scope: 'Test',
          },
          {
            id: 'direct-local-same',
            title: 'Registered original',
            url: null,
            locator: 'Appendix A',
            scope: 'Test',
          },
          {
            id: 'unrelated',
            title: 'Unrelated paper',
            url: 'https://example.org/unrelated',
            locator: 'Section 7',
            scope: 'Test',
          },
        );
        claim.evidence = [
          'direct-a',
          'direct-b',
          'direct-page',
          'direct-publisher',
          'direct-local',
          'direct-local-same',
        ];
        relation.evidence_refs = [{ paper_id: paper.id, claim_id: claim.id }];
        for (const source of data.sources.slice(-7)) {
          source.verification = 'not-checked';
        }
        validateCandidate(data);

        const options = {
          script: new URL('../assets/research-view.js', import.meta.url),
          elementIds,
          navigation: 'items',
          prefix: '#paper=',
          title: 'item-title',
        };
        const view = openView(data, '#relation=' + relation.id, options);
        const sourceEvidence = view.elements.get('content').children[2];
        const [heading, advisory, reading, firstClaim] = sourceEvidence.children;
        assert.equal(heading.tagName, 'H3');
        assert.match(
          advisory.textContent,
          language === 'ko' ? /이 주장을 바탕으로 추천한 연결/ : /reading suggestion/,
        );
        assert.equal(reading.tagName, 'DIV');
        const links = reading.children.filter((item) => item.tagName === 'A');
        assert.deepEqual(
          links.map((link) => link.href),
          [url, otherPage, otherPublisher],
        );
        for (const link of links) {
          assert.equal(link.target, '_blank');
          assert.equal(link.rel, 'noopener noreferrer');
        }
        assert.match(
          links[0].attributes.get('aria-label'),
          /Registered original.*Section 2 \/ Table 1/,
        );
        assert.match(links[1].attributes.get('aria-label'), /^Registered original.*Appendix A/);
        assert.ok(links[1].attributes.get('aria-label').includes(otherPage));
        assert.ok(links[2].attributes.get('aria-label').includes(otherPublisher));
        assert.match(
          links[1].attributes.get('aria-label'),
          language === 'ko' ? /새 탭$/ : /new tab$/,
        );
        assert.ok(reading.textContent.includes(otherPage));
        assert.ok(reading.textContent.includes(otherPublisher));
        assert.ok(!reading.textContent.includes(url));
        assert.match(reading.textContent, /Section 2 \/ Table 1/);
        assert.match(reading.textContent, /Local PDF.*Appendix B/);
        assert.doesNotMatch(reading.textContent, /Unrelated paper|null/);
        assert.match(firstClaim.textContent, new RegExp(claim.id));
      },
    );
  }
for (const mode of ['paper-relations', 'project-application'])
  for (const version of [1, 2]) {
    test(`${mode} v${version}: paper opens exact registered URLs and retains all locations before collapsed evidence`, () => {
      const data = fixture(mode, version),
        paper = data.papers[0];
      const source = data.sources.find((item) => item.id === paper.claims[0].evidence[0]);
      source.url = 'https://example.org/paper.pdf?edition=2#original';
      const second = { ...source, id: source.id + '.second', locator: 'Section 4 · Table 2' };
      data.sources.push(second);
      paper.claims[0].evidence.push(second.id);
      const additional = {
        ...source,
        id: source.id + '.other',
        url: 'https://example.org/other.pdf',
        locator: 'Appendix A',
      };
      data.sources.push(additional);
      paper.claims[0].evidence.push(additional.id);
      validateCandidate(data);
      renderCandidate(data);
      const reading = openPaper(data, paper.id).children[0];
      assert.equal(reading.className, 'research-section paper-source-links');
      const links = reading.children.filter((child) => child.tagName === 'A');
      assert.deepEqual(
        links.map((link) => link.href),
        [source.url, additional.url],
      );
      assert.ok(reading.textContent.includes(source.locator));
      assert.ok(reading.textContent.includes(second.locator));
      assert.ok(reading.textContent.includes(additional.locator));
      for (const link of links) {
        assert.equal(link.target, '_blank');
        assert.equal(link.rel, 'noopener noreferrer');
        assert.match(link.attributes.get('aria-label'), /new tab/);
      }
    });
    test(`${mode} v${version}: missing URLs and unreferenced sources never invent a paper shortcut`, () => {
      const data = fixture(mode, version),
        paper = data.papers[0];
      data.sources.forEach((source) => {
        source.url = null;
      });
      data.sources.push({
        id: 'unused',
        title: 'Unreferenced source',
        url: 'https://example.org/unused',
        locator: 'Section 1',
        scope: 'Synthetic fixture',
        verification: 'not-checked',
      });
      validateCandidate(data);
      assert.ok(!openPaper(data, paper.id).textContent.includes('Read the paper'));
      const isolated = data.papers.find((item) => item.claims.length === 0);
      assert.ok(isolated);
      assert.ok(!openPaper(data, isolated.id).textContent.includes('Read the paper'));
    });
  }
test('paper shortcuts preserve URL and dangling-evidence validation', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///secret',
    'https://user:password@example.org',
  ]) {
    const data = fixture('paper-relations');
    data.sources[0].url = url;
    assert.throws(() => validateCandidate(data));
  }
  const data = fixture('paper-relations');
  data.papers[0].claims[0].evidence = ['missing'];
  assert.throws(() => validateCandidate(data));
});

const backgroundFixture = () => {
  const data = fixture('paper-relations', 2);
  data.sources.find((source) => source.id === data.papers[1].claims[0].evidence[0]).url =
    'https://example.org/background';
  data.concepts = [
    {
      id: data.papers[0].id,
      title: 'Shared representation',
      summary: 'An AI explanation of a concept, not a paper or an origin claim.',
    },
  ];
  data.backgrounds = [
    {
      id: 'B.Explore',
      paper_id: data.papers[0].id,
      concept_id: data.concepts[0].id,
      origin: 'ai',
      status: 'proposed',
      rationale: 'Explore this concept only if it helps with the current question.',
      readings: [
        {
          paper_id: data.papers[1].id,
          rationale: 'Selected for its focused explanation, not as the first invention.',
          evidence: [...data.papers[1].claims[0].evidence],
          return_question: 'What does the current paper change about this shared idea?',
        },
      ],
    },
  ];
  return data;
};
const openBackground = (data, hash = '#paper=' + data.start, mapApi) =>
  openView(data, hash, {
    script: new URL('../assets/research-view.js', import.meta.url),
    elementIds,
    navigation: 'items',
    prefix: '#paper=',
    title: 'item-title',
    mapApi,
  });

for (const version of [1, 2])
  for (const language of ['en', 'ko']) {
    test(`bare paper maps select start without stealing focus; explicit routes remain intact (v${version}, ${language})`, () => {
      const data = fixture('paper-relations', version);
      data.language = language;
      data.start = data.papers[1].id;
      const initial = openBackground(data, '');
      assert.equal(initial.elements.get('item-title').textContent, data.papers[1].title);
      assert.notEqual(initial.activeElement, initial.elements.get('item-title'));
      const overview = openBackground(data, '#overview=all');
      assert.notEqual(overview.elements.get('item-title').textContent, data.papers[1].title);
      const linked = openBackground(data, '#paper=' + encodeURIComponent(data.papers[0].id));
      assert.equal(linked.elements.get('item-title').textContent, data.papers[0].title);
      const invalid = openBackground(data, '#paper=unknown');
      assert.equal(
        invalid.elements.get('item-title').textContent,
        overview.elements.get('item-title').textContent,
      );
    });
  }
const linksIn = (element) =>
  element.children
    .filter((child) => typeof child !== 'string')
    .flatMap((child) => [...(child.tagName === 'A' ? [child] : []), ...linksIn(child)]);

test('validated concept tiers match the opening map legend in Korean', () => {
  const data = backgroundFixture();
  data.language = 'ko';
  for (const tier of ['method', 'claims', 'recipe']) {
    data.concepts[0].tier = tier;
    validateCandidate(data);
    const legend = openBackground(data).elements.get('map-legend').textContent;
    // "Concepts numbered in reading order"
    assert.equal(legend.includes('읽을 순서대로 번호를 붙인 개념'), tier !== 'recipe');
    assert.doesNotMatch(legend, /Purple ellipses/);
  }
  data.concepts[0].tier = 'other';
  assert.throws(() => validateCandidate(data), /concept.tier/);
});

test('focal metadata is explicit, v2 paper-only, and independent of accessible selection', () => {
  const data = backgroundFixture();
  for (const id of [null, 'not-registered', data.papers[1].id]) {
    assert.throws(() => validateCandidate({ ...data, focal_paper_id: id }), /focal_paper_id/);
  }
  for (const legacy of [fixture('paper-relations'), fixture('project-application', 2)]) {
    assert.throws(() => validateCandidate({ ...legacy, focal_paper_id: legacy.papers[0].id }));
  }
  const neutral = openBackground(data, '');
  assert.ok(!neutral.elements.get('items').textContent.includes('Focal paper'));
  for (const [language, label] of [
    ['en', 'Focal paper'],
    ['ko', '중심 논문'],
  ]) {
    const named = { ...data, language, focal_paper_id: data.start };
    validateCandidate(named);
    const view = openBackground(named, ''),
      nodeLinks = linksIn(view.elements.get('items'));
    const focal = nodeLinks.find((link) => link.href === '#paper=' + data.start);
    const other = nodeLinks.find((link) => link.href === '#paper=' + data.papers[1].id);
    assert.ok(focal.textContent.includes(label));
    assert.equal(focal.attributes.get('aria-current'), 'true');
    other.click();
    assert.ok(focal.textContent.includes(label));
    assert.ok(!other.textContent.includes(label));
    assert.equal(other.attributes.get('aria-current'), 'true');
    assert.ok(!focal.attributes.has('aria-current'));
    assert.equal(view.activeElement.id, 'item-title');
    view.location.hash = '#background=' + named.backgrounds[0].id;
    assert.ok(view.elements.get('items').textContent.includes(label));
  }
});

test('keyboard and canvas background links stay on the first map and keep shared concept contexts', () => {
  const data = backgroundFixture(),
    [first] = data.backgrounds;
  const other = {
    ...first,
    id: 'B.Other',
    paper_id: data.papers[2].id,
    rationale: 'A separate context for the same concept.',
    readings: [
      { ...first.readings[0], return_question: 'Compare with a different starting paper.' },
    ],
  };
  data.backgrounds.push(other);
  validateCandidate(data);
  let mountCount = 0,
    dispatch;
  const mapApi = {
    mount(_container, _data, _scene, select) {
      mountCount++;
      dispatch = select;
      return { select() {} };
    },
  };
  const view = openBackground(data, '', mapApi);
  const concept = data.concepts[0];
  const items = linksIn(view.elements.get('items'));
  const conceptLink = items.find((link) => link.href === '#concept=' + concept.id);
  const connections = linksIn(view.elements.get('map-links')),
    content = view.elements.get('content');
  assert.equal(items.filter((link) => link.href.startsWith('#concept=')).length, 1);
  assert.equal(
    connections.filter((link) => link.href.startsWith('#relation=')).length,
    data.relations.length,
  );
  assert.equal(
    connections.filter((link) => link.href.startsWith('#background-reading=')).length,
    2,
  );
  conceptLink.click();
  assert.equal(view.elements.get('item-title').textContent, concept.title);
  assert.ok(
    content.textContent.includes(first.rationale) && content.textContent.includes(other.rationale),
  );
  assert.equal(conceptLink.attributes.get('aria-current'), 'true');
  const hop = connections.find((link) => link.href === '#concept-need=' + other.id);
  hop.click();
  assert.ok(!content.textContent.includes(first.rationale));
  assert.ok(content.textContent.includes(other.rationale));
  const id = other.id + ':' + other.readings[0].paper_id;
  dispatch({ type: 'background-reading', recordId: id });
  assert.equal(view.elements.get('item-title').textContent, data.papers[1].title);
  assert.ok(content.textContent.includes(other.readings[0].return_question));
  assert.ok(linksIn(content).some((link) => link.href === 'https://example.org/background'));
  assert.equal(
    connections
      .find((link) => link.href === '#background-reading=' + encodeURIComponent(id))
      .attributes.get('aria-current'),
    'true',
  );
  assert.equal(mountCount, 1);
  assert.equal(view.elements.get('map-heading').textContent, 'Connections between papers');
  const deepLink = openBackground(data, '#background-reading=' + encodeURIComponent(id));
  assert.equal(deepLink.elements.get('item-title').textContent, data.papers[1].title);
  assert.ok(
    deepLink.elements.get('content').textContent.includes(other.readings[0].return_question),
  );
});

test('relation list and details use the same source, suggestion and stale labels in both languages', () => {
  for (const language of ['en', 'ko'])
    for (const [origin, status, stale, english, korean] of [
      ['ai', 'proposed', false, 'Suggested connection', '추천 연결'],
      ['source', 'proposed', false, 'Source relation not checked', '원문 관계 미확인'],
      ['source', 'source-checked', false, 'Source-checked relation', '원문 확인 관계'],
      ['source', 'source-checked', true, 'Source relation not checked', '원문 관계 미확인'],
    ]) {
      const data = backgroundFixture();
      data.language = language;
      const relation = data.relations[0];
      Object.assign(relation, { origin, status, needs_recheck: stale });
      const view = openBackground(data, '#relation=' + relation.id);
      const label = language === 'ko' ? korean : english;
      const link = linksIn(view.elements.get('map-links')).find(
        (link) => link.href === '#relation=' + relation.id,
      );
      assert.ok(link.textContent.includes(label));
      assert.equal(view.elements.get('metadata').children[0].textContent, label);
      assert.equal(
        view.elements.get('metadata').children[0].className,
        stale ? 'badge warning' : 'badge',
      );
    }
});

test('concept background references are explicit, local to a paper and always AI proposals', () => {
  validateCandidate(backgroundFixture());
  const invalid = [
    (data) => {
      delete data.concepts;
    },
    (data) => {
      data.version = 1;
    },
    (data) => {
      data.concepts.push(data.concepts[0]);
    },
    (data) => {
      data.backgrounds[0].concept_id = 'missing';
    },
    (data) => {
      data.backgrounds[0].paper_id = 'missing';
    },
    (data) => {
      data.backgrounds.push({ ...data.backgrounds[0], id: 'B.Other' });
    },
    (data) => {
      data.backgrounds[0].origin = 'source';
    },
    (data) => {
      data.backgrounds[0].status = 'source-checked';
    },
    (data) => {
      data.backgrounds[0].required = true;
    },
    (data) => {
      data.backgrounds[0].readings.push(data.backgrounds[0].readings[0]);
    },
    (data) => {
      data.backgrounds[0].readings[0].paper_id = data.papers[0].id;
    },
    (data) => {
      data.backgrounds[0].readings[0].evidence = ['missing'];
    },
    (data) => {
      data.backgrounds[0].readings[0].evidence = data.papers[0].claims[0].evidence;
    },
  ];
  for (const change of invalid) {
    const data = backgroundFixture();
    change(data);
    assert.throws(() => validateCandidate(data));
  }
});

test('a required concept without an accessible reading stays on the first map as a marked gap', () => {
  const data = JSON.parse(
    readFileSync(new URL('../assets/paper-backgrounds.v2.example.json', import.meta.url), 'utf8'),
  );
  data.concepts.push({
    id: 'gap-concept',
    title: 'Unreached concept',
    summary: 'Needed to read the method; no primary reading was accessible.',
  });
  data.backgrounds.push({
    id: 'B.gap',
    paper_id: data.start,
    concept_id: 'gap-concept',
    origin: 'ai',
    status: 'proposed',
    rationale: 'The cited source could not be opened in this run.',
    readings: [],
  });
  validateCandidate(data);
  assert.match(renderCandidate(data), /<p class="first-map-summary">[^<]*\d+ key concepts/);
  const view = openBackground(data, '#concept=gap-concept');
  assert.equal(view.elements.get('item-title').textContent, 'Unreached concept');
  assert.match(view.elements.get('metadata').textContent, /No reading secured/);
  assert.ok(view.elements.get('content').textContent.includes('could not be opened'));
});

test('recipe-tier concepts fold under the legend and are counted apart from key concepts', () => {
  const data = JSON.parse(
    readFileSync(new URL('../assets/paper-backgrounds.v2.example.json', import.meta.url), 'utf8'),
  );
  data.concepts.push({
    id: 'recipe-concept',
    title: 'Training recipe',
    summary: 'A training detail.',
    tier: 'recipe',
  });
  data.backgrounds.push({
    id: 'B.recipe',
    paper_id: data.start,
    concept_id: 'recipe-concept',
    origin: 'ai',
    status: 'proposed',
    rationale: 'Not opened in this run.',
    readings: [],
  });
  validateCandidate(data);
  assert.match(
    renderCandidate(data),
    /<p class="first-map-summary">[^<]*1 training and evaluation concept ·/,
  );
  assert.throws(
    () =>
      validateCandidate({
        ...data,
        concepts: data.concepts.map((item) =>
          item.id === 'recipe-concept' ? { ...item, tier: 'other' } : item,
        ),
      }),
    /concept\.tier/,
  );
  const view = openBackground(data, '#paper=' + data.start);
  const legend = view.elements.get('map-legend').textContent;
  assert.ok(
    legend.includes('1 training and evaluation concept') &&
      legend.includes('Training recipe') &&
      legend.includes('No reading secured'),
  );
  // The paper's concept list numbers only map concepts; the folded one is listed apart, never as "0".
  const find = (root, className) =>
    typeof root === 'string'
      ? []
      : [
          ...(root.className === className ? [root] : []),
          ...root.children.flatMap((child) => find(child, className)),
        ];
  const content = view.elements.get('content');
  assert.deepEqual(
    find(content, 'concept-order-list').flatMap((list) => list.children.map((item) => item.value)),
    [1],
  );
  assert.ok(find(content, 'concept-folded-list')[0].textContent.includes('Training recipe'));
});

test('folded recipe shortcuts keep separate questions for a shared reading', () => {
  const data = JSON.parse(
    readFileSync(new URL('../assets/paper-backgrounds.v2.example.json', import.meta.url), 'utf8'),
  );
  const background = data.backgrounds[0],
    reading = background.readings[0];
  const titles = ['Decoding', 'Vocabulary'];
  for (const title of titles) {
    data.concepts.push({ id: title, title, summary: title, tier: 'recipe' });
    data.backgrounds.push({
      ...background,
      id: 'B.' + title,
      concept_id: title,
      readings: [{ ...reading, return_question: 'How does ' + title + ' work?' }],
    });
  }
  validateCandidate(data);
  const view = openBackground(data, '#paper=' + data.start);
  const shortcuts = linksIn(view.elements.get('map-legend')).filter(
    (link) => link.textContent === data.papers[1].short_title,
  );
  assert.equal(shortcuts.length, titles.length);
  titles.forEach((title, index) => {
    shortcuts[index].click();
    assert.equal(
      view.location.hash,
      '#background-reading=' + encodeURIComponent('B.' + title + ':' + reading.paper_id),
    );
    assert.equal(view.elements.get('position').textContent, title);
    const content = view.elements.get('content');
    assert.ok(content.textContent.includes('How does ' + title + ' work?'));
    assert.ok(linksIn(content).some((link) => link.href === '#concept-need=B.' + title));
  });
});

test('English first-map summary uses singular nouns for one item', () => {
  const data = JSON.parse(
    readFileSync(new URL('../assets/paper-backgrounds.v2.example.json', import.meta.url), 'utf8'),
  );
  assert.match(
    renderCandidate(data),
    /<p class="first-map-summary">[^<]*1 key concept · 1 paper to read</,
  );
});

test('shared recipe readings name the starting paper and return to its question', () => {
  const data = backgroundFixture();
  data.concepts[0].tier = 'recipe';
  const first = data.backgrounds[0];
  const other = {
    ...first,
    id: 'B.Other',
    paper_id: data.papers[2].id,
    readings: [{ ...first.readings[0], return_question: 'How does the other paper compare?' }],
  };
  data.backgrounds.push(other);
  validateCandidate(data);
  const view = openBackground(data);
  const choices = linksIn(view.elements.get('map-legend')).filter((link) =>
    link.href.startsWith('#background-reading='),
  );
  assert.equal(choices.length, 2);
  for (const [index, route] of data.backgrounds.entries()) {
    const start = data.papers.find((paper) => paper.id === route.paper_id);
    assert.ok(choices[index].textContent.includes(start.short_title ?? start.title));
    choices[index].click();
    assert.ok(view.elements.get('content').textContent.includes(route.readings[0].return_question));
    assert.ok(
      linksIn(view.elements.get('content')).some(
        (link) => link.href === '#concept-need=' + route.id,
      ),
    );
  }
});

test('first-map source rows visibly distinguish editions that share a locator', () => {
  const data = backgroundFixture(),
    paper = data.papers[0],
    source = data.sources[0];
  const edition = {
    ...source,
    id: 'S.Other',
    title: 'Second edition',
    url: 'https://example.org/second',
  };
  data.sources.push(edition);
  paper.claims[0].evidence.push(edition.id);
  validateCandidate(data);
  const content = openBackground(data).elements.get('content');
  const section = content.children.find((child) => child.className?.includes('paper-source-links'));
  for (const item of [source, edition]) {
    const row = section.children.find(
      (child) =>
        child.className === 'source-row' && linksIn(child).some((link) => link.href === item.url),
    );
    assert.ok(row.textContent.includes(item.title));
    assert.ok(row.textContent.includes(item.locator));
    assert.ok(linksIn(row)[0].attributes.get('aria-label').includes(item.locator));
  }
});

test('duplicate paper aliases stay distinct in the recipe and connection lists', () => {
  const data = backgroundFixture(),
    [first] = data.backgrounds,
    [reading] = first.readings;
  const another = { ...data.papers[1], id: 'P.Another' };
  data.papers.push(another);
  for (const paper of data.papers) paper.short_title = 'Shared alias';
  data.concepts[0].tier = 'recipe';
  first.readings.push({ ...reading, paper_id: another.id });
  data.backgrounds.push({ ...first, id: 'B.Other', paper_id: data.papers[2].id });
  validateCandidate(data);
  const view = openBackground(data);
  for (const list of ['map-links', 'map-legend']) {
    const links = linksIn(view.elements.get(list)).filter((link) =>
      link.href.startsWith('#background-reading='),
    );
    assert.equal(links.length, 4);
    assert.equal(new Set(links.map((link) => link.textContent)).size, 4);
  }
});

test('a reading opened through a concept names that concept, not the one it hangs under', () => {
  const data = JSON.parse(
    readFileSync(new URL('../assets/paper-backgrounds.v2.example.json', import.meta.url), 'utf8'),
  );
  const reading = data.backgrounds[0].readings[0];
  data.concepts.push({
    id: 'second',
    title: 'Second concept',
    summary: 'Another concept that suggests the same reading.',
  });
  data.backgrounds.push({
    ...data.backgrounds[0],
    id: 'B.Second',
    concept_id: 'second',
    readings: [{ ...reading }],
  });
  validateCandidate(data);
  const position = (hash) => openBackground(data, hash).elements.get('position').textContent;
  assert.equal(
    position('#background-reading=B.Second:' + reading.paper_id),
    'Concept 2 · Second concept',
  );
  assert.equal(position('#paper=' + reading.paper_id), 'Concept 1 · ' + data.concepts[0].title);
});

test('first maps lead with a reader summary and keep full authorship and coverage text in the scope fold', () => {
  const data = JSON.parse(
    readFileSync(new URL('../assets/paper-backgrounds.v2.example.json', import.meta.url), 'utf8'),
  );
  const html = renderCandidate(data);
  const concepts = new Set(data.backgrounds.map((item) => item.concept_id)).size;
  assert.match(
    html,
    new RegExp(
      '<p class="first-map-summary">[^<]*' +
        concepts +
        (concepts === 1 ? ' key concept ' : ' key concepts'),
    ),
  );
  assert.match(html, /<p class="first-map-note">Prepared with an AI agent · Exploration view/);
  const fold = (markup) =>
    markup.slice(
      markup.indexOf('<details class="first-map-overview">'),
      markup.indexOf('<div class="research-workspace">'),
    );
  assert.equal((html.match(/class="description authorship"/g) ?? []).length, 1);
  assert.ok(
    fold(html).includes('class="description authorship"') &&
      fold(html).includes('Exploration view: source checks may be incomplete.'),
  );
  const complete = renderCandidate(data, {
    complete: true,
    completionScope: 'Selected passages only.',
  });
  assert.match(
    complete,
    /<p class="first-map-note">Prepared with an AI agent · Source checks recorded for the displayed claims<\/p>/,
  );
  assert.ok(
    fold(complete).includes('Recorded source checks complete') &&
      fold(complete).includes('Selected passages only.'),
  );
  const focal = data.papers.find((paper) => paper.id === data.start);
  const escaped = renderCandidate({
    ...data,
    focal_paper_id: data.start,
    papers: data.papers.map((paper) =>
      paper === focal ? { ...paper, title: 'A <b> title' } : paper,
    ),
  });
  assert.match(escaped, /<p class="first-map-summary">A &lt;b&gt; title/);
  const plain = renderCandidate(fixture('paper-relations', 2));
  assert.ok(!plain.includes('<p class="first-map-summary">'));
  assert.ok(
    plain.indexOf('class="description authorship"') <
      plain.indexOf('class="description source-coverage"'),
  );
});
test('the distributed background example validates and renders with separate concepts', () => {
  const data = JSON.parse(
    readFileSync(new URL('../assets/paper-backgrounds.v2.example.json', import.meta.url), 'utf8'),
  );
  validateCandidate(data);
  assert.ok(renderCandidate(data).includes('backgrounds'));
  const view = openBackground(data, '#background=' + data.backgrounds[0].id);
  assert.equal(view.elements.get('item-title').textContent, data.concepts[0].title);
  assert.ok(
    view.elements.get('content').textContent.includes(data.backgrounds[0].readings[0].rationale),
  );
});

test('Korean UI follows the declared language without translating research or source data', () => {
  const data = backgroundFixture();
  data.language = 'ko';
  data.papers[0].title = 'Read the paper';
  data.papers[0].notes = ['Cites'];
  data.sources[0].title = 'Open original source ↗';
  const saved = JSON.stringify(data);
  validateCandidate(data);
  const html = renderCandidate(data);
  assert.match(html, /<html lang="ko">/);
  // Korean labels in this test, in order: "Skip to content", "Zoom in", "Earlier records",
  // "Paper source", "Expand background", "Concept background", "...does not mean a source
  // citation or a required prerequisite.", "Open original source", "new tab", "Come back and compare"
  // and "Connections between papers".
  assert.ok(html.includes('본문으로 건너뛰기'));
  assert.ok(html.includes('aria-label="확대"'));
  assert.ok(html.includes('이전 기록'));
  const view = openBackground(data, '#paper=' + data.start),
    content = view.elements.get('content');
  assert.equal(view.elements.get('item-title').textContent, 'Read the paper');
  assert.ok(content.textContent.includes('Cites'));
  assert.ok(content.textContent.includes('논문 원문'));
  // First maps show the bare concept title (as numbered on the map) and keep the action in the accessible name.
  assert.ok(
    linksIn(content).some(
      (link) =>
        link.textContent === data.concepts[0].title &&
        link.attributes.get('aria-label') === '배경 펼치기 · ' + data.concepts[0].title,
    ),
  );
  linksIn(content)
    .find((link) => link.href === '#background=B.Explore')
    .click();
  assert.equal(
    view.elements.get('map-heading').textContent,
    '개념 배경 · ' + data.concepts[0].title,
  );
  assert.ok(
    view.elements
      .get('map-notice')
      .textContent.includes('원문의 인용 관계나 필수 선수 조건을 뜻하지 않습니다.'),
  );
  const source = linksIn(content).find((link) => link.href === 'https://example.org/background');
  assert.equal(source.textContent, '원문 열기 ↗');
  assert.ok(source.attributes.get('aria-label').endsWith(' · 원문 열기 · 새 탭'));
  assert.ok(content.textContent.includes(data.backgrounds[0].readings[0].return_question));
  linksIn(content)
    .find((link) => link.href.startsWith('#background-paper='))
    .click();
  assert.ok(content.textContent.includes('돌아와 비교하기'));
  linksIn(content)
    .find((link) => link.href === '#paper=' + data.start)
    .click();
  assert.equal(view.elements.get('map-heading').textContent, '논문 사이의 연결');
  assert.equal(JSON.stringify(data), saved);
});

test('Korean overview is gated; unsupported language fails and English remains the default', () => {
  const data = backgroundFixture();
  assert.match(renderCandidate(data), /<html lang="en">/);
  const oldOverview = overviewFor(data);
  data.language = 'en';
  assert.deepEqual(overviewFor(data), oldOverview);
  data.language = 'ko';
  Object.assign(data, overviewFor(data));
  // "Papers ..." and "...does not mean understanding is complete".
  assert.match(data.description, /^논문 /);
  assert.match(data.scope, /이해 완료를 뜻하지 않습니다/);
  const performance = performancePlan(data).map((entry) => ({
    ...entry,
    kind: 'non-performance',
    reason: 'Synthetic language regression.',
  }));
  const evidence = { version: 2, sources: [], counts: [], tables: [], performance };
  verifyEvidence(data, evidence, '.');
  assert.throws(() => verifyEvidence({ ...data, ...oldOverview }, evidence, '.'), /canonical/);
  for (const language of ['fr', '', null, 'ko"><script>'])
    assert.throws(() => validateCandidate({ ...data, language }), /candidate.language/);
});

test('project research UI and message placeholders preserve supplied content in Korean', () => {
  for (const version of [1, 2]) {
    const data = fixture('project-application', version);
    data.language = 'ko';
    const html = renderCandidate(data),
      content = openPaper(data, data.papers[0].id);
    // "Project application" and "Paper source"; below, "selected" and "{count} items".
    assert.ok(html.includes('프로젝트 적용'));
    assert.ok(content.textContent.includes('논문 원문'));
    assert.ok(content.textContent.includes(data.papers[0].claims[0].statement));
  }
  const scope = { window: {} };
  runInNewContext(languageScript('ko'), scope);
  assert.equal(
    scope.window.DanseoText('{title} selected', { title: 'Read the paper {title} <b>' }),
    'Read the paper {title} <b> 선택됨',
  );
  assert.equal(scope.window.DanseoText('{count} items', { count: 0 }), '0개 항목');
  assert.equal(scope.window.DanseoText('Unknown phrase'), 'Unknown phrase');
});

test('optional background navigation returns to the original paper without resetting its background camera', () => {
  const data = backgroundFixture();
  validateCandidate(data);
  let mounts = 0,
    restored;
  const savedPaperState = {
    filters: { category: 'source', kind: 'cites', mode: 'all' },
    zoom: 0.8,
    pan: { x: 10, y: 20 },
    positions: {},
  };
  const mapApi = {
    mount(_host, _data, scene, _select, _filter, _background, paperState) {
      mounts++;
      if (scene === 'papers') restored = paperState;
      return {
        destroy() {},
        select() {},
        snapshot() {
          return savedPaperState;
        },
      };
    },
  };
  const view = openBackground(data, '#paper=' + data.start, mapApi),
    content = view.elements.get('content');
  assert.ok(content.textContent.includes('Concept background'));
  linksIn(content)
    .find((link) => link.href === '#background=B.Explore')
    .click();
  assert.equal(view.elements.get('item-title').textContent, data.concepts[0].title);
  assert.ok(
    view.elements.get('map-notice').textContent.includes('not citations or required prerequisites'),
  );
  assert.ok(
    content.textContent.includes(
      data.sources.find((source) => source.id === data.backgrounds[0].readings[0].evidence[0])
        .locator,
    ),
  );
  const originalSource = linksIn(content).find(
    (link) => link.href === 'https://example.org/background',
  );
  assert.equal(originalSource.target, '_blank');
  assert.equal(originalSource.rel, 'noopener noreferrer');
  assert.equal(view.activeElement.id, 'item-title');
  const backgroundMounts = mounts;
  linksIn(content)
    .find((link) => link.href.startsWith('#background-paper='))
    .click();
  assert.equal(mounts, backgroundMounts);
  assert.equal(view.elements.get('item-title').textContent, data.papers[1].title);
  assert.equal(content.children[0].className, 'research-section paper-source-links');
  assert.ok(content.textContent.includes(data.backgrounds[0].readings[0].return_question));
  assert.equal(view.elements.get('previous').disabled, true);
  linksIn(content)
    .find((link) => link.href === '#paper=' + data.start)
    .click();
  assert.equal(view.elements.get('item-title').textContent, data.papers[0].title);
  assert.equal(view.elements.get('map-heading').textContent, 'Connections between papers');
  assert.equal(restored, savedPaperState);
  linksIn(content)
    .find((link) => link.href === '#background=B.Explore')
    .click();
  view.location.hash = '#overview=all';
  assert.equal(
    view.elements.get('announcement').textContent,
    'From relations to source evidence selected',
  );
});

test('background deep links reopen only registered readings and preserve missing-location uncertainty', () => {
  const data = backgroundFixture(),
    background = data.backgrounds[0];
  background.readings[0].evidence = [];
  validateCandidate(data);
  const view = openBackground(data, '#background=' + background.id);
  assert.ok(view.elements.get('content').textContent.includes('No linked source location'));
  const resumed = openBackground(
    data,
    '#background-paper=' + encodeURIComponent(background.id + ':' + data.papers[1].id),
  );
  assert.equal(resumed.elements.get('item-title').textContent, data.papers[1].title);
  assert.ok(resumed.elements.get('content').textContent.includes('Return to current paper'));
  const invalid = openBackground(
    data,
    '#background-paper=' + encodeURIComponent(background.id + ':' + data.papers[2].id),
  );
  assert.equal(invalid.elements.get('item-title').textContent, 'From relations to source evidence');
});

test('background projection keeps concept and paper namespaces distinct and leaves citation/reading-order data unchanged', () => {
  const data = backgroundFixture(),
    scope = { window: {} };
  runInNewContext(
    readFileSync(new URL('../assets/research-map.js', import.meta.url), 'utf8'),
    scope,
  );
  const original = JSON.stringify(data.relations);
  const elements = scope.window.DanseoMap.build(data, 'background', data.backgrounds[0].id);
  const nodes = elements.filter((item) => item.group === 'nodes');
  assert.equal(nodes.length, 3);
  assert.equal(new Set(nodes.map((item) => item.data.id)).size, 3);
  assert.ok(
    nodes
      .filter((item) => item.data.type === 'paper')
      .every((item) => item.data.label.includes('Publication year unknown')),
  );
  assert.equal(nodes.filter((item) => item.data.type === 'concept').length, 1);
  assert.ok(
    elements
      .filter((item) => item.group === 'edges')
      .every((item) => item.data.origin === 'ai' && item.data.state === 'proposed'),
  );
  assert.equal(JSON.stringify(data.relations), original);
  const main = scope.window.DanseoMap.build(data, 'papers');
  const mainPapers = main.filter((item) => item.group === 'nodes' && item.data.type === 'paper');
  assert.equal(mainPapers.length, data.papers.length);
  assert.ok(mainPapers.every((item) => item.data.label.includes('Publication year unknown')));
  assert.equal(
    main.filter((item) => item.group === 'nodes' && item.data.type === 'concept').length,
    1,
  );
  const [firstHop, secondHop] = main.filter(
    (item) => item.group === 'edges' && item.data.origin === 'ai' && item.data.backgroundId,
  );
  assert.equal(firstHop.data.source, 'paper:' + data.papers[0].id);
  assert.equal(firstHop.data.target, 'concept:' + data.concepts[0].id);
  assert.equal(firstHop.data.target, secondHop.data.source);
  assert.equal(secondHop.data.target, 'paper:' + data.papers[1].id);
  assert.equal(main.filter((item) => item.data.type === 'relation').length, data.relations.length);
  data.papers[0].publication = {
    date: '2017-06-12',
    edition_date: '2023-08-02',
    source_id: data.sources[0].id,
  };
  const dated = scope.window.DanseoMap.build(data, 'background', data.backgrounds[0].id);
  assert.match(dated.find((item) => item.data.recordId === data.papers[0].id).data.label, /2017/);
  assert.ok(dated.every((item) => !/AI|draft|Paper review/.test(item.data.label)));
  assert.ok(dated.every((item) => !item.data.focal));
  data.focal_paper_id = data.start;
  const focused = scope.window.DanseoMap.build(data, 'background', data.backgrounds[0].id);
  assert.equal(focused.filter((item) => item.data.focal).length, 1);
  assert.match(focused.find((item) => item.data.focal).data.label, /^Focal paper/);
});

test('all new concept/background prose is screened without changing the old canonical overview', () => {
  const data = backgroundFixture();
  validateCandidate(data);
  Object.assign(data, overviewFor(data));
  const entries = performancePlan(data).map((entry) => ({
    ...entry,
    kind: 'non-performance',
    reason: 'Synthetic non-performance description.',
  }));
  const evidence = { version: 2, sources: [], counts: [], tables: [], performance: entries };
  verifyEvidence(data, evidence, '.');
  const paths = [
    '/concepts/0/title',
    '/concepts/0/summary',
    '/backgrounds/0/rationale',
    '/backgrounds/0/readings/0/rationale',
    '/backgrounds/0/readings/0/return_question',
  ];
  for (const path of paths) {
    assert.ok(performanceFields(data).has(path));
    assert.throws(
      () =>
        verifyEvidence(
          data,
          { ...evidence, performance: entries.filter((entry) => entry.path !== path) },
          '.',
        ),
      /missing performance screening/,
    );
  }
  const previous = fixture('paper-relations', 2);
  assert.deepEqual(
    overviewFor(previous),
    overviewFor({ ...previous, concepts: [], backgrounds: [] }),
  );
  assert.match(data.description, /Concept backgrounds: 1/);
});

test('reading reason requires performance screening and cannot introduce an unbound count', () => {
  const data = fixture('paper-relations', 2);
  const paper = data.papers[0];
  const reasonPath = '/papers/0/reading_reason';
  paper.reading_reason = 'Read the method before comparing the papers.';
  Object.assign(data, overviewFor(data));
  const screening = () =>
    performancePlan(data).map((entry) => ({
      ...entry,
      kind: 'non-performance',
      reason: 'Synthetic reading guidance.',
    }));
  const evidence = { version: 2, sources: [], counts: [], tables: [], performance: screening() };
  verifyEvidence(data, evidence, '.');
  assert.throws(
    () =>
      verifyEvidence(
        data,
        {
          ...evidence,
          performance: evidence.performance.filter((entry) => entry.path !== reasonPath),
        },
        '.',
      ),
    /missing performance screening/,
  );

  paper.reading_reason = 'Read how the authors selected 17 records.';
  assert.throws(
    () =>
      verifyEvidence(
        data,
        {
          ...evidence,
          performance: screening(),
        },
        '.',
      ),
    /record\/pair count statement needs source-bound evidence/,
  );
});

test('new concept/background text cannot bypass source-bound record and pair counts', () => {
  for (const change of [
    (data) => {
      data.concepts[0].summary = '17 records';
    },
    (data) => {
      data.backgrounds[0].rationale = '17 pairs';
    },
    (data) => {
      data.backgrounds[0].readings[0].return_question = 'Compare 17 records';
    },
  ]) {
    const data = backgroundFixture();
    change(data);
    validateCandidate(data);
    Object.assign(data, overviewFor(data));
    const performance = performancePlan(data).map((entry) => ({
      ...entry,
      kind: 'non-performance',
      reason: 'Synthetic coverage alone does not validate counts.',
    }));
    assert.throws(
      () =>
        verifyEvidence(data, { version: 2, sources: [], counts: [], tables: [], performance }, '.'),
      /record\/pair count statement needs source-bound evidence/,
    );
  }
  const data = backgroundFixture();
  Object.assign(data, overviewFor(data));
  const performance = performancePlan(data).map((entry) => ({
    ...entry,
    kind: 'non-performance',
    reason: 'Synthetic screening.',
  }));
  const binding = {
    path: '/backgrounds/0/readings/0/rationale',
    source_id: data.papers[0].claims[0].evidence[0],
    page: 1,
    quote: '17 records',
    items: [{ unit: 'records', value: 17 }],
  };
  assert.throws(
    () =>
      verifyEvidence(
        data,
        { version: 2, sources: [], counts: [binding], tables: [], performance },
        '.',
      ),
    /source must be linked/,
  );
});
