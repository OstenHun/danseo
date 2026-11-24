(() => {
  'use strict';
  // Terms used below: a "first map" is a paper map with concept backgrounds, where cards show
  // why and where to read; "recipe" concepts (training, data, evaluation) are folded out of it.
  const t = window.DanseoText ?? ((text) => text);
  const byId = (id) => document.getElementById(id);
  const data = JSON.parse(byId('candidate').textContent);
  const projectMode = data.mode === 'project-application';
  const papers = new Map(data.papers.map((paper) => [paper.id, paper]));
  const sources = new Map(data.sources.map((source) => [source.id, source]));
  const presentation = window.DanseoGraph;
  // The same plan the map draws from, so "Concept N" here always matches pill N and the card's tree line.
  const plan = presentation.conceptPlan(data);
  // Each paper's representative venue rank, when its sources link it.
  function linkedVenueRanks() {
    const ranks = new Map();
    for (const paper of data.papers) {
      const ranking = presentation.linkedVenueRank(paper.venue_rank, sources);
      if (ranking) ranks.set(paper.id, ranking);
    }
    return ranks;
  }
  const venueRanks = linkedVenueRanks();
  const hasCitationCounts = data.papers.some((paper) => paper.citations);
  const hasVenueMetadata = data.papers.some((paper) => paper.venue_rank);
  const concepts = new Map((data.concepts ?? []).map((item) => [item.id, item]));
  const backgrounds = new Map((data.backgrounds ?? []).map((item) => [item.id, item]));
  // The backgrounds of each concept, in input order.
  function backgroundsByConcept() {
    const byConcept = new Map();
    for (const background of backgrounds.values()) {
      if (!byConcept.has(background.concept_id)) byConcept.set(background.concept_id, []);
      byConcept.get(background.concept_id).push(background);
    }
    return byConcept;
  }
  const linkedConcepts = backgroundsByConcept();
  const items = projectMode ? data.applications : data.papers;
  const prefix = projectMode ? '#application=' : '#paper=';
  const topics = new Map((data.project_context?.items ?? []).map((item) => [item.id, item]));
  const paperName = (id) => papers.get(id).short_title ?? papers.get(id).title;
  // How many papers share each short name; a shared name is replaced by the full title and ID.
  function countAliases() {
    const counts = new Map();
    for (const paper of data.papers) {
      const alias = paperName(paper.id);
      counts.set(alias, (counts.get(alias) ?? 0) + 1);
    }
    return counts;
  }
  const aliasCounts = countAliases();
  function backgroundPaperName(id) {
    const alias = paperName(id);
    return aliasCounts.get(alias) > 1 ? papers.get(id).title + ' (' + id + ')' : alias;
  }
  function initialScene() {
    if (projectMode && data.map_view === 'context') return 'context';
    return projectMode ? 'applications' : 'papers';
  }
  let scene = initialScene();
  let map,
    activeBackground,
    paperMapState,
    selectedType = projectMode ? 'application' : 'paper';
  // `details` receives edition dates and date provenance; the first-publication date stays in `parent`.
  function appendPublication(parent, paper, details = parent) {
    if (paper.review_status === 'needs-recheck')
      parent.append(badge(t('Evidence needs rechecking'), true));
    if (!paper.publication) return;
    parent.append(badge(t('First published · {date}', { date: paper.publication.date })));
    if (paper.publication.edition_date !== null)
      details.append(badge(t('Edition date · {date}', { date: paper.publication.edition_date })));
    const source = sources.get(paper.publication.source_id);
    if (source?.url) {
      const link = node('a', 'badge', t('Publication date source ↗'));
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      details.append(link);
    } else if (source)
      details.append(
        node(
          'p',
          'section-note',
          t('Publication date evidence · {source} · {location} · {scope}', {
            source: source.title,
            location: source.locator,
            scope: source.scope,
          }),
        ),
      );
  }
  const kindLabels = {
    cites: t('Cites'),
    extends: t('Extends'),
    compares: t('Compares'),
    'related-to': t('Related connection'),
    'reading-order': t('Suggested reading order'),
  };
  function relationLabel(relation) {
    if (relation.origin === 'ai') return t('Suggested connection');
    if (relation.status === 'source-checked' && !relation.needs_recheck)
      return t('Source-checked relation');
    return t('Source relation not checked');
  }
  function node(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  const paragraph = (value) => node('p', '', value);
  function section(title, cls = '') {
    const el = node('section', 'research-section ' + cls);
    el.append(node('h3', '', title));
    return el;
  }
  function badge(value, warning = false) {
    return node('span', warning ? 'badge warning' : 'badge', value);
  }
  function paragraphs(parent, values, empty) {
    if (!values.length) parent.append(node('p', 'empty-note', empty));
    else for (const value of values) parent.append(paragraph(value));
  }
  // The check state shown after a source title.
  function sourceCheckLabel(source) {
    if (source.verification === 'agent-checked') return t(' · Recorded source check');
    if (data.version === 2) return t(' · No source check in this run');
    return t(' · Source unchecked');
  }
  function evidence(parent, evidenceIds, { bibliographic = false } = {}) {
    if (!evidenceIds.length) {
      parent.append(
        node('p', 'empty-note', t('No linked source location · source coverage is not inferred.')),
      );
      return;
    }
    for (const id of evidenceIds) {
      const source = sources.get(id),
        detail = node('details', 'source');
      const status = bibliographic ? '' : sourceCheckLabel(source);
      detail.append(
        node('summary', '', source.title + status),
        paragraph(t('Location: ') + source.locator),
        paragraph(t('Check scope: ') + source.scope),
      );
      if (!bibliographic)
        detail.append(
          paragraph(
            t(
              'Check status is declared by the recorder. It does not establish full-paper reading, independent review or reproduction.',
            ),
          ),
        );
      if (source.url !== null) {
        const link = node(
          'a',
          '',
          t(bibliographic ? 'Open metadata source ↗' : 'Open original source ↗'),
        );
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        detail.append(link);
      } else
        detail.append(
          paragraph(t('No external link recorded · use the specified local original.')),
        );
      parent.append(detail);
    }
  }
  function appendPaperSources(parent, paper, compact = false) {
    appendSourceLinks(
      parent,
      paper.claims.flatMap((claim) => claim.evidence),
      { paperTitle: paper.title, compact },
    );
  }
  function appendReadingReason(parent, paper) {
    if (!paper.reading_reason) return;
    const reason = section(t('Why read this paper'));
    reason.append(paragraph(paper.reading_reason));
    parent.append(reason);
  }
  function appendRankLabel(parent, ranking) {
    const label = node('p', 'venue-rank-line');
    label.append(
      node('span', '', ranking.scheme + ' ' + ranking.edition),
      presentation.venueBadge(ranking, { includeScheme: false }),
    );
    parent.append(paragraph(ranking.venue), label);
    if (presentation.isJcr(ranking.scheme)) {
      parent.append(
        paragraph(
          ranking.category
            ? t('JCR subject category · {category}', { category: ranking.category })
            : t('JCR subject category unreported'),
        ),
      );
    } else if (ranking.category)
      parent.append(paragraph(t('Subject category · {category}', { category: ranking.category })));
  }
  function rankingLink(ranking) {
    const link = node('a', '', t('Open ranking source ↗'));
    link.href = sources.get(ranking.source_id).url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }
  function appendAdditionalRanks(parent, rankings, representative) {
    if (!rankings.length) return;
    const disclosure = node('details', 'source');
    disclosure.append(node('summary', '', t('Other venue rankings')));
    for (const ranking of rankings) {
      const entry = node('div', 'additional-venue-rank');
      appendRankLabel(entry, ranking);
      const source = sources.get(ranking.source_id);
      entry.append(
        paragraph(source.title + ' · ' + source.locator),
        paragraph(t('Check scope: ') + source.scope),
        rankingLink(ranking),
      );
      if (
        ranking.venue_source_id !== ranking.source_id &&
        ranking.venue_source_id !== representative?.venue_source_id
      ) {
        evidence(entry, [ranking.venue_source_id], { bibliographic: true });
      }
      disclosure.append(entry);
    }
    parent.append(disclosure);
  }
  function appendCitations(metrics, citations) {
    if (citations) {
      const count = new Intl.NumberFormat(data.language ?? 'en').format(citations.count);
      metrics.append(
        paragraph(t('Citations · {count} · checked {date}', { count, date: citations.checked_on })),
      );
      evidence(metrics, [citations.source_id], { bibliographic: true });
    } else if (hasCitationCounts || projectMode) {
      metrics.append(paragraph(t('Citation count unavailable')));
    }
  }
  function appendPaperMetrics(parent, paper) {
    const citations = paper.citations,
      ranking = venueRanks.get(paper.id);
    if (projectMode && !hasCitationCounts && !hasVenueMetadata) return;
    const additionalRanks = (paper.additional_venue_ranks ?? [])
      .map((rank) => presentation.linkedVenueRank(rank, sources))
      .filter(Boolean);
    const metrics = section(
      t(hasCitationCounts || projectMode ? 'Citations and venue ranking' : 'Venue ranking'),
    );
    appendCitations(metrics, citations);
    if (ranking) {
      appendRankLabel(metrics, ranking);
      if (ranking.top_tier) metrics.append(paragraph(t('Top tier in this ranking')));
      evidence(metrics, [...new Set([ranking.venue_source_id, ranking.source_id])], {
        bibliographic: true,
      });
    } else if (!projectMode || paper.venue_rank) {
      if (additionalRanks.length) metrics.append(paragraph(t('Representative rank unverified')));
      else
        metrics.append(
          presentation.venueBadge(),
          paragraph(t('Publication and ranking sources are required for a venue rank.')),
        );
    }
    appendAdditionalRanks(metrics, additionalRanks, ranking);
    parent.append(metrics);
  }
  // The first ranking seen for each grade, grouped by ranking scheme and edition.
  function groupVenueRanks() {
    const groups = new Map();
    for (const ranking of venueRanks.values()) {
      const key = ranking.scheme.toLowerCase() + '\0' + ranking.edition;
      if (!groups.has(key)) groups.set(key, new Map());
      const grades = groups.get(key);
      if (!grades.has(ranking.rank)) grades.set(ranking.rank, ranking);
    }
    return groups;
  }
  // One scheme's table: every grade of a known scale with its meaning, then grades on this map
  // that the scale does not list.
  function venueGuideTable(ranks, first, scale) {
    const table = node('table', ''),
      head = node('thead', ''),
      headings = node('tr', '');
    for (const label of ['Rank', scale ? 'Meaning' : 'Source on this map']) {
      const header = node('th', '', t(label));
      header.setAttribute('scope', 'col');
      headings.append(header);
    }
    head.append(headings);
    table.append(head);
    const body = node('tbody', '');
    function row(ranking, ...contents) {
      const tr = node('tr', ''),
        grade = node('td', ''),
        description = node('td', '');
      grade.append(presentation.venueBadge(ranking, { includeScheme: false }));
      description.append(...contents);
      tr.append(grade, description);
      body.append(tr);
    }
    if (scale) {
      for (const [rank, meaning] of scale.grades) {
        const observed = scale.linkObservedGrades ? ranks.get(rank) : undefined;
        const guideRanking = observed ?? { ...first, rank };
        if (observed) row(guideRanking, node('div', '', t(meaning)), rankingLink(observed));
        else row(guideRanking, t(meaning));
      }
    }
    for (const ranking of ranks.values()) {
      if (scale?.grades.has(ranking.rank)) continue;
      const meaning = scale?.otherGrades?.get(ranking.rank);
      if (meaning) row(ranking, node('div', '', t(meaning)), rankingLink(ranking));
      else row(ranking, rankingLink(ranking));
    }
    table.append(body);
    return table;
  }
  function venueGuide() {
    const groups = groupVenueRanks();
    const guide = node('details', 'venue-guide');
    guide.id = 'venue-guide';
    guide.append(
      node('summary', '', t('Venue ranking guide')),
      paragraph(
        t(
          'Badges describe publication venues. Compare grades within the same ranking scheme. The ranking edition and the paper’s publication date are separate.',
        ),
      ),
    );
    for (const ranks of groups.values()) {
      const first = ranks.values().next().value;
      const scale = presentation.venueRankScale(first.scheme);
      guide.append(node('h3', '', first.scheme + ' ' + first.edition));
      if (scale?.description) guide.append(paragraph(t(scale.description)));
      const table = venueGuideTable(ranks, first, scale);
      guide.append(table);
      if (scale) {
        const link = node('a', '', t(scale.sourceLabel));
        link.href = scale.sourceUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        guide.append(link);
      }
    }
    if (venueRanks.size < data.papers.length) {
      const note = paragraph('');
      note.append(
        presentation.venueBadge(),
        ' ',
        t('Publication and ranking sources are required for a venue rank.'),
      );
      guide.append(note);
    }
    return guide;
  }
  function groupSourceLocations(evidenceIds, includeLocal) {
    const bySource = new Map();
    for (const id of evidenceIds) {
      const source = sources.get(id);
      if (source.url === null && !includeLocal) continue;
      const key = source.url ?? id;
      if (!bySource.has(key)) bySource.set(key, { source, locators: new Set() });
      bySource.get(key).locators.add(source.locator);
    }
    return [...bySource.values()];
  }

  function sourceLocations(groupedSources) {
    return groupedSources.map(({ source, locators }) => {
      const location = t('Read at: {locations}', { locations: [...locators].join(' / ') });
      return {
        source,
        location,
        locators: [...locators].join(' / '),
        name: source.title + ' · ' + location,
      };
    });
  }
  // How often each linked source name repeats; a repeated name also shows its address.
  function countLinkNames(locations) {
    const linkNameCounts = new Map();
    for (const { source, name } of locations) {
      if (source.url !== null) linkNameCounts.set(name, (linkNameCounts.get(name) ?? 0) + 1);
    }
    return linkNameCounts;
  }
  // First-map rows: where to read on the left, one short link on the right; the section title already says "read".
  function compactSourceRow({ source, location, locators }, showAddress, paperTitle) {
    const row = node('div', 'source-row');
    row.append(
      node('p', '', source.title + ' · ' + locators + (showAddress ? ' · ' + source.url : '')),
    );
    if (source.url !== null) {
      const link = node('a', '', t('Open original source ↗'));
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const label = t('{paper} · {source} · open original source · new tab', {
        paper: paperTitle,
        source: source.title,
      });
      link.setAttribute(
        'aria-label',
        label + ' · ' + location + (showAddress ? ' · ' + source.url : ''),
      );
      row.append(link);
    }
    return row;
  }
  // A source title, or a link to it, followed by where to read and, when names repeat, its address.
  function appendSourceEntry(reading, { source, location, name }, showAddress, paperTitle) {
    // Relation evidence has no paper title and lists every source by name.
    const relationEvidence = paperTitle === null;
    if (source.url === null) {
      reading.append(node('p', '', source.title));
    } else {
      const label = relationEvidence ? source.title + ' ↗' : t('Open original source ↗');
      const link = node('a', 'map-item', label);
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const accessibleName = relationEvidence
        ? name + (showAddress ? ' · ' + source.url : '') + t(' · open original source · new tab')
        : t('{paper} · {source} · open original source · new tab', {
            paper: paperTitle,
            source: source.title,
          });
      link.setAttribute('aria-label', accessibleName);
      reading.append(link);
    }
    reading.append(node('p', 'section-note', location));
    if (showAddress) reading.append(node('p', 'section-note', source.url));
  }
  function appendSourceLinks(parent, evidenceIds, { paperTitle = null, compact = false } = {}) {
    const relationEvidence = paperTitle === null;
    const groupedSources = groupSourceLocations(evidenceIds, relationEvidence);
    if (!groupedSources.length) return;
    const locations = sourceLocations(groupedSources);
    // First maps show two locations up front; the rest stay one click away.
    let more = null;
    const linkNameCounts = relationEvidence || compact ? countLinkNames(locations) : new Map();
    const reading = relationEvidence
      ? node('div', 'paper-source-links')
      : section(t('Read the paper'), 'paper-source-links');
    for (const [index, location] of locations.entries()) {
      const { source, name } = location;
      const showAddress = source.url !== null && linkNameCounts.get(name) > 1;
      if (!compact || relationEvidence) {
        appendSourceEntry(reading, location, showAddress, paperTitle);
        continue;
      }
      const row = compactSourceRow(location, showAddress, paperTitle);
      if (index >= 2 && !more) {
        more = node('details', 'source-more');
        more.append(
          node('summary', '', t('{count} more source locations', { count: locations.length - 2 })),
        );
        reading.append(more);
      }
      (more ?? reading).append(row);
    }
    parent.append(reading);
  }
  function referencedClaim({ paper_id, claim_id }) {
    const paper = papers.get(paper_id);
    return { paper, claim: paper.claims.find((claim) => claim.id === claim_id) };
  }
  function reviewStateSuffix(state) {
    if (state === 'stale') return t(' · Needs rechecking');
    if (state === 'unknown') return t(' · Current validity unknown');
    return '';
  }
  function claims(parent, refs) {
    for (const ref of refs) {
      const { paper, claim } = referencedClaim(ref);
      const block = node('div', 'claim');
      if (paper.review_status === 'needs-recheck')
        block.append(badge(t('Evidence needs rechecking'), true));
      block.append(
        node('p', 'claim-id', paper.id + ' / ' + claim.id),
        node('h4', '', paper.title),
        paragraph(t('Edition: ') + (paper.edition ?? t('Not recorded'))),
        paragraph(claim.statement),
      );
      if (claim.conditions.length) {
        const conditions = section(t('Paper conditions'));
        paragraphs(conditions, claim.conditions, '');
        block.append(conditions);
      }
      if (claim.limitations.length) {
        const limitations = section(t('Paper limits'));
        paragraphs(limitations, claim.limitations, '');
        block.append(limitations);
      }
      if (!claim.conditions.length && !claim.limitations.length)
        block.append(
          node(
            'p',
            'empty-note',
            t(
              'No separate conditions or limits are recorded. Read the relation rationale and original card context together.',
            ),
          ),
        );
      evidence(block, claim.evidence);
      parent.append(block);
      for (const review of claim.reviews ?? []) {
        const record = node('div', 'review-record');
        record.append(
          badge(
            t('Claim review · ') + review.verdict + reviewStateSuffix(review.state),
            review.state !== 'current',
          ),
          paragraph(review.reason),
        );
        const more = node('details');
        more.append(
          node('summary', '', t('Source evidence and review record')),
          paragraph(review.scope),
          paragraph(review.reviewer + ' · ' + review.reviewed_at + ' · ' + review.review_type),
        );
        record.append(more);
        block.append(record);
      }
    }
  }
  function appendNotes(parent, notes) {
    for (const note of notes) {
      const lines = note.split('\n'),
        heading = /^## +(.+)$/.exec(lines[0]),
        block = node('section', 'paper-note-section');
      if (heading) block.append(node('h4', '', heading[1]));
      block.append(node('p', 'paper-note', heading ? lines.slice(1).join('\n').trim() : note));
      parent.append(block);
    }
  }
  const nav = new Map();
  // Paper maps with venue data get a ranking guide below the map status or the legend; returns
  // the guide, or null.
  function placeVenueGuide() {
    const guide = !projectMode && hasVenueMetadata ? venueGuide() : null;
    if (guide) byId(linkedConcepts.size ? 'map-status' : 'map-legend').after(guide);
    return guide;
  }
  const gradeGuide = placeVenueGuide();
  function localLink(type, id, title, cls) {
    const a = node('a', cls, title);
    a.href = '#' + type + '=' + encodeURIComponent(id);
    return a;
  }
  // The records a scene lists: topics on the context map, papers then applications on a project
  // map, and otherwise the papers.
  function listedItems() {
    if (scene === 'context') return data.project_context.items;
    if (projectMode) return [...data.papers, ...items];
    return items;
  }
  function itemType(item) {
    if (scene === 'context') return 'topic';
    return data.papers.includes(item) ? 'paper' : 'application';
  }
  function listMapItems(listed) {
    for (const item of listed) {
      const type = itemType(item);
      const li = node('li'),
        a = localLink(type, item.id, item.short_title ?? item.title, 'map-item');
      if (!projectMode) {
        a.className += ' map-item-ranked';
        a.replaceChildren(
          node('span', 'ranked-paper-title', a.textContent),
          presentation.venueBadge(venueRanks.get(item.id)),
        );
        if (data.focal_paper_id === item.id)
          a.append(node('span', 'map-focal-label', t('Focal paper')));
      }
      li.append(a);
      byId('items').append(li);
      nav.set(type + ':' + item.id, a);
    }
    for (const id of linkedConcepts.keys()) {
      const li = node('li'),
        link = localLink(
          'concept',
          id,
          t('Concept · ') + concepts.get(id).title,
          'map-item map-concept-item',
        );
      li.append(link);
      byId('items').append(li);
      nav.set('concept:' + id, link);
    }
  }
  function nodeKindLabel() {
    if (scene === 'context') return t('Concepts');
    if (projectMode) return t('Projects · papers');
    return linkedConcepts.size ? t('Papers and concepts') : t('Paper');
  }
  function listLabel() {
    if (scene === 'context') return t('Concept list');
    if (projectMode) return t('Projects and papers');
    return linkedConcepts.size ? t('Papers and concepts') : t('Paper list');
  }
  function mapHeading() {
    if (scene === 'context') return data.project_context.title;
    if (projectMode) return t('Current question and paper evidence');
    return t('Connections between papers');
  }
  function mapNotice() {
    if (scene === 'context') return data.project_context.notice;
    if (projectMode)
      return t(
        'Dashed lines are claim references recorded in an Application. They do not establish causal or performance inheritance.',
      );
    return linkedConcepts.size
      ? t(
          'Select a paper, concept, or connection to read its evidence. Filters apply to paper relations.',
        )
      : t(
          'Check relation types and both endpoints before selecting an edge or the corresponding record in the list.',
        );
  }
  function legendText() {
    if (scene === 'context') return t('Purple dashed lines · suggested reading order.');
    if (projectMode)
      return t(
        'Dashed lines · project evidence references. Paper review and project decisions are separate.',
      );
    return t(
      'Green solid · source-checked relation / purple dashed · suggested connection / amber dashed · recheck',
    );
  }
  function linksHeading() {
    if (scene === 'context') return t('Suggested order and connection rationale');
    if (projectMode) return t('Corresponding evidence references');
    return t('Corresponding relations');
  }
  // Scene texts: the list's kind and accessible name, the map heading, notice and legend. Each
  // comes from one function above; linksHeading names the link list below the map.
  function describeScene(listed, legend) {
    byId('count').textContent = t('{count} items', { count: listed.length + linkedConcepts.size });
    byId('node-kind').textContent = nodeKindLabel();
    byId('map-node-navigation').setAttribute('aria-label', listLabel());
    byId('map-heading').textContent = mapHeading();
    byId('map-notice').textContent = mapNotice();
    legend.textContent = legendText();
  }
  // First maps show line samples instead of prose: the map itself explains selection.
  function legendSamples() {
    return [
      ['source', t('Source-checked relation')],
      ['ai', t('AI-suggested reading path')],
      ...(data.relations.some((relation) => presentation.category(relation) === 'stale')
        ? [['stale', t('Recheck')]]
        : []),
      ...(plan.order.length ? [['concept', t('Concept, numbered in reading order')]] : []),
    ].map(([kind, label]) => {
      const key = node('span', 'legend-key');
      key.append(node('i', 'legend-sample legend-' + kind, kind === 'concept' ? '1' : ''), label);
      return key;
    });
  }
  // A folded concept with links to its readings, naming the paper each comes from when several do.
  function recipeItem(concept) {
    const li = node('li', ''),
      contexts = linkedConcepts.get(concept.id);
    li.append(localLink('concept', concept.id, concept.title, ''));
    if (contexts.every((background) => !background.readings.length))
      li.append(node('span', 'recipe-gap', ' · ' + t('No reading secured')));
    for (const background of contexts) {
      const suffix =
        contexts.length > 1
          ? t(' · from {paper}', { paper: backgroundPaperName(background.paper_id) })
          : '';
      for (const reading of background.readings) {
        li.append(
          ' · ',
          localLink(
            'background-reading',
            background.id + ':' + reading.paper_id,
            backgroundPaperName(reading.paper_id) + suffix,
            '',
          ),
        );
      }
    }
    return li;
  }
  function showFirstMapLegend(legend) {
    byId('map-notice').hidden = true;
    legend.replaceChildren(...legendSamples());
    // Training, data and evaluation concepts stay one click away instead of crowding the opening map.
    const recipe = (data.concepts ?? []).filter(
      (concept) => concept.tier === 'recipe' && linkedConcepts.has(concept.id),
    );
    if (recipe.length) {
      const fold = node('details', 'recipe-fold'),
        list = node('ul', '');
      fold.append(node('summary', '', foldedCount(recipe.length)), list);
      for (const concept of recipe) {
        const li = recipeItem(concept);
        list.append(li);
      }
      legend.append(fold);
    }
  }
  // What the link list below the map shows: topic links, application evidence or paper relations.
  function mapLinkRecords() {
    if (scene === 'context') return data.project_context.links;
    if (projectMode)
      return items.flatMap((app) =>
        data.papers
          .filter((paper) => app.claim_refs.some((ref) => ref.paper_id === paper.id))
          .map((paper) => ({ app, paper })),
      );
    return data.relations;
  }
  function mapLinkFields(item, index) {
    if (scene === 'context')
      return {
        type: 'context-link',
        id: String(index),
        title: topics.get(item.source).title + ' → ' + topics.get(item.target).title,
        sub: item.label + t(' · suggested reading order'),
      };
    if (projectMode)
      return {
        type: 'reference',
        id: item.app.id + ':' + item.paper.id,
        title: paperName(item.paper.id) + ' → ' + item.app.title,
        sub:
          item.app.claim_refs.filter((ref) => ref.paper_id === item.paper.id).length +
          t(' claims · compare with project conditions'),
      };
    return {
      type: 'relation',
      id: item.id,
      title:
        paperName(item.source) + ' → ' + paperName(item.target) + ' · ' + kindLabels[item.kind],
      sub: relationLabel(item) + (item.needs_recheck ? t(' · Needs rechecking') : ''),
    };
  }
  function listMapLinks() {
    const links = mapLinkRecords();
    byId('map-links').append(node('h3', '', linksHeading()));
    if (!links.length)
      byId('map-links').append(
        node('p', 'empty-note', t('No registered relations · disconnected items are still shown.')),
      );
    links.forEach((item, index) => {
      const { type, id, title, sub } = mapLinkFields(item, index);
      const a = localLink(type, id, undefined, 'map-link'),
        body = node('span', '', title);
      body.append(node('span', 'link-subtitle', sub));
      a.append(node('span', 'index', String(index + 1).padStart(2, '0')), body);
      byId('map-links').append(a);
      nav.set(type + ':' + id, a);
    });
  }
  function listBackgroundConnections() {
    const list = byId('map-links');
    list.append(node('h3', '', t('Suggested concept and background connections')));
    const addConnection = (type, id, title) => {
      const link = localLink(type, id, title, 'map-item map-background-link');
      list.append(link);
      nav.set(type + ':' + id, link);
    };
    for (const background of backgrounds.values()) {
      const title = concepts.get(background.concept_id).title;
      const from = backgroundPaperName(background.paper_id);
      addConnection('concept-need', background.id, t('Explore concept · ') + from + ' → ' + title);
      for (const reading of background.readings) {
        const route =
          t('Background reading · ') + title + ' → ' + backgroundPaperName(reading.paper_id);
        addConnection(
          'background-reading',
          background.id + ':' + reading.paper_id,
          linkedConcepts.get(background.concept_id).length > 1
            ? route + t(' · from {paper}', { paper: from })
            : route,
        );
      }
    }
  }
  // Map selections become hash routes; the relation filter hides list links to relations it rules out.
  function mountSceneMap() {
    map = window.DanseoMap?.mount(
      byId('research-map'),
      data,
      scene,
      (item) => {
        const id = item.type === 'reference' ? item.recordId + ':' + item.paperId : item.recordId;
        location.hash = '#' + item.type + '=' + encodeURIComponent(id);
      },
      (matches) => {
        for (const relation of data.relations ?? []) {
          const link = nav.get('relation:' + relation.id);
          if (link) link.hidden = !matches(relation);
        }
      },
      undefined,
      paperMapState,
      venueRanks,
    );
    byId('map-status').textContent = map
      ? t('Drag nodes · pan background · wheel/buttons to zoom · fit all')
      : t('Unable to load the map. Use the corresponding records below to navigate.');
    for (const button of byId('scene-controls').children)
      button.setAttribute('aria-pressed', String(button.scene === scene));
  }
  function mountMap(nextScene) {
    activeBackground = undefined;
    map?.destroy();
    scene = nextScene;
    nav.clear();
    byId('items').replaceChildren();
    byId('map-links').replaceChildren();
    byId('research-map').className = scene === 'context' ? 'context-map' : '';
    const listed = listedItems();
    listMapItems(listed);
    const legend = byId('map-legend');
    describeScene(listed, legend);
    if (linkedConcepts.size && scene === 'papers') showFirstMapLegend(legend);
    else byId('map-notice').hidden = false;
    if (gradeGuide) gradeGuide.hidden = scene !== 'papers';
    if (scene === 'papers' && hasCitationCounts) {
      legend.append(
        node('br'),
        node(
          'span',
          '',
          t('Node size = citation count · capped; unavailable counts use the base size.'),
        ),
      );
    }
    listMapLinks();
    if (linkedConcepts.size) listBackgroundConnections();
    mountSceneMap();
  }
  const backgroundNotice = t(
    'Optional background readings, not citations or required prerequisites.',
  );
  // The current paper, the concept and its readings, as list items keyed like the map's nodes.
  function listBackgroundItems(background, concept) {
    const addItem = (type, id, key, title) => {
      const li = node('li'),
        link = localLink(type, id, title, 'map-item');
      li.append(link);
      byId('items').append(li);
      nav.set(key, link);
      if (data.focal_paper_id && key === 'paper:' + data.focal_paper_id)
        link.append(node('span', 'map-focal-label', ' · ' + t('Focal paper')));
    };
    addItem(
      'paper',
      background.paper_id,
      'paper:' + background.paper_id,
      t('Current paper · ') + paperName(background.paper_id),
    );
    addItem('background', background.id, 'concept:' + concept.id, t('Concept · ') + concept.title);
    for (const reading of background.readings)
      addItem(
        'background-paper',
        background.id + ':' + reading.paper_id,
        'paper:' + reading.paper_id,
        t('Representative reading · ') + paperName(reading.paper_id),
      );
  }
  // Selecting the current paper returns to the main map; readings and the concept stay in this scene.
  function mountBackgroundMap(background) {
    map = window.DanseoMap?.mount(
      byId('research-map'),
      data,
      scene,
      (item) => {
        if (item.type === 'paper' && item.recordId === background.paper_id)
          location.hash = '#paper=' + encodeURIComponent(background.paper_id);
        else if (item.type === 'paper' || item.type === 'background-reading')
          location.hash =
            '#background-paper=' +
            encodeURIComponent(background.id + ':' + (item.paperId ?? item.recordId));
        else location.hash = '#background=' + encodeURIComponent(background.id);
      },
      () => {},
      background.id,
    );
    byId('map-status').textContent = map
      ? t('Drag nodes · pan background · wheel/buttons to zoom · fit all')
      : t('Unable to load the map. Use the matching concept background items to navigate.');
  }
  function mountBackground(background) {
    if (scene === 'background' && activeBackground === background.id) return;
    if (scene === 'papers') paperMapState = map?.snapshot?.();
    map?.destroy();
    scene = 'background';
    activeBackground = background.id;
    nav.clear();
    if (gradeGuide) gradeGuide.hidden = true;
    byId('items').replaceChildren();
    byId('map-links').replaceChildren();
    byId('research-map').className = '';
    const concept = concepts.get(background.concept_id);
    listBackgroundItems(background, concept);
    byId('count').textContent = t('{count} items', { count: background.readings.length + 2 });
    byId('node-kind').textContent = t('Papers and concept');
    byId('map-node-navigation').setAttribute('aria-label', t('Concept background items'));
    byId('map-heading').textContent = t('Concept background · ') + concept.title;
    byId('map-notice').textContent = backgroundNotice;
    byId('map-notice').hidden = false;
    byId('map-legend').textContent = t(
      'Paper rectangles · concept ellipse / dashed lines · suggested background readings',
    );
    byId('map-links').append(
      localLink(
        'paper',
        background.paper_id,
        t('Return to paper relationships · ') + paperName(background.paper_id),
        'map-item',
      ),
    );
    mountBackgroundMap(background);
  }
  const conceptOrder = () => plan.order;
  const foldedCount = (count) =>
    t(
      count === 1
        ? '{count} training and evaluation concept'
        : '{count} training and evaluation concepts',
      { count },
    );
  function appendConceptChoices(parent, paper) {
    const linked = [...backgrounds.values()].filter((item) => item.paper_id === paper.id);
    if (!linked.length) return;
    const sectionNode = section(t('Concept background'));
    if (scene === 'papers') {
      const order = conceptOrder();
      const conceptLink = (item) => {
        const link = localLink(
          'background',
          item.id,
          concepts.get(item.concept_id).title,
          'concept-order-link',
        );
        link.setAttribute(
          'aria-label',
          t('Explore background · ') + concepts.get(item.concept_id).title,
        );
        return link;
      };
      // Concepts on the map keep the same numbers as their pills.
      const numbered = linked
        .filter((item) => order.includes(item.concept_id))
        .sort((a, b) => order.indexOf(a.concept_id) - order.indexOf(b.concept_id));
      if (numbered.length) {
        const list = node('ol', 'concept-order-list');
        for (const item of numbered) {
          const li = node('li', '');
          li.value = order.indexOf(item.concept_id) + 1;
          li.append(conceptLink(item));
          list.append(li);
        }
        sectionNode.append(list);
      }
      // Folded training and evaluation concepts have no map number, so they get their own unnumbered list.
      const unnumbered = linked.filter((item) => !order.includes(item.concept_id));
      if (unnumbered.length) {
        const list = node('ul', 'concept-folded-list');
        for (const item of unnumbered) {
          const li = node('li', '');
          li.append(conceptLink(item));
          list.append(li);
        }
        sectionNode.append(
          node('p', 'concept-folded-heading', foldedCount(unnumbered.length)),
          list,
        );
      }
    } else
      for (const item of linked)
        sectionNode.append(
          localLink(
            'background',
            item.id,
            t('Explore background · ') + concepts.get(item.concept_id).title,
            'map-item',
          ),
        );
    parent.append(sectionNode);
  }
  function appendBackgroundReadings(content, background, readingRoute) {
    const reason = section(t('Why explore this concept from ') + paperName(background.paper_id));
    reason.append(paragraph(background.rationale));
    content.append(reason);
    for (const reading of background.readings) {
      const block = section(t('Representative reading · ') + paperName(reading.paper_id));
      block.append(
        paragraph(reading.rationale),
        localLink(
          readingRoute,
          background.id + ':' + reading.paper_id,
          t('Read selected background · ') + paperName(reading.paper_id),
          'map-item',
        ),
      );
      appendSourceLinks(block, reading.evidence, {
        paperTitle: papers.get(reading.paper_id).title,
      });
      for (const sourceId of reading.evidence) {
        const source = sources.get(sourceId);
        if (source.url === null) block.append(paragraph(t('Read at: ') + source.locator));
      }
      evidence(block, reading.evidence);
      block.append(paragraph(t('Return and compare: ') + reading.return_question));
      content.append(block);
    }
  }
  // The backgrounds a concept route shows: all of a concept's backgrounds, or the one background asked for.
  function conceptContexts(id, type, background) {
    if (type === 'concept') return linkedConcepts.get(id);
    return background ? [background] : undefined;
  }
  function appendConceptContexts(content, linked, type) {
    for (const context of linked) {
      appendBackgroundReadings(
        content,
        context,
        type === 'background' ? 'background-paper' : 'background-reading',
      );
      if (type !== 'background')
        content.append(
          localLink(
            'background',
            context.id,
            t('Open focused background · ') + paperName(context.paper_id),
            'map-item',
          ),
        );
      content.append(
        localLink(
          'paper',
          context.paper_id,
          t('Return to current paper · ') + paperName(context.paper_id),
          'map-item',
        ),
      );
    }
  }
  function showConcept(id, focus, type) {
    const background = type === 'concept' ? undefined : backgrounds.get(id);
    const concept = concepts.get(background?.concept_id ?? id);
    const linked = conceptContexts(id, type, background);
    if (!linked) return false;
    if (type === 'background') mountBackground(background);
    else if (scene === 'background') mountMap('papers');
    const content = byId('content'),
      meta = byId('metadata');
    content.replaceChildren();
    meta.replaceChildren();
    byId('position').textContent = t('CONCEPT BACKGROUND · ') + id;
    byId('item-title').textContent = concept.title;
    // A required concept recorded without an accessible primary reading says so before its explanation.
    if (linked.every((context) => !context.readings.length))
      meta.append(badge(t('No reading secured'), true));
    content.append(paragraph(concept.summary));
    if (type !== 'background') content.append(node('p', 'origin-note', backgroundNotice));
    appendConceptContexts(content, linked, type);
    selectedType = type;
    selected = id;
    byId('previous').disabled = true;
    byId('next').disabled = true;
    byId('current-count').textContent = t('Explore only what you need');
    highlight(type === 'background' ? 'concept' : type, type === 'background' ? concept.id : id);
    byId('announcement').textContent = t('{title} background selected', { title: concept.title });
    if (focus) byId('item-title').focus();
    return true;
  }
  function showBackgroundPaper(compositeId, focus, type) {
    const [backgroundId, paperId, extra] = compositeId.split(':'),
      background = backgrounds.get(backgroundId);
    const reading = background?.readings.find((item) => item.paper_id === paperId);
    if (extra || !reading) return false;
    if (type === 'background-paper') mountBackground(background);
    else if (scene === 'background') mountMap('papers');
    select(paperId, focus, undefined, { background, reading });
    if (type === 'background-reading') {
      selectedType = type;
      selected = compositeId;
      highlight(type, compositeId);
    }
    byId('previous').disabled = true;
    byId('next').disabled = true;
    byId('current-count').textContent = t('Optional background reading');
    return true;
  }
  // Project maps with a context switch between the context and the applications; paper maps can
  // return to the relation overview.
  function addSceneControls() {
    if (projectMode && data.project_context)
      for (const [value, title] of [
        ['context', data.project_context.title],
        ['applications', t('Project–paper connections')],
      ]) {
        const button = node('button', '', title);
        button.type = 'button';
        button.scene = value;
        button.addEventListener('click', () => {
          location.hash =
            value === 'context'
              ? '#topic=' + encodeURIComponent(data.project_context.start)
              : '#application=' + encodeURIComponent(data.start);
        });
        byId('scene-controls').append(button);
      }
    if (!projectMode)
      byId('scene-controls').append(
        localLink('overview', 'all', t('Relation overview'), 'map-item'),
      );
  }
  addSceneControls();
  for (const item of data.provenance ?? [])
    byId('provenance').append(paragraph(item.name + ' · SHA-256 ' + item.sha256));
  let selected;
  // An application: its decision, the project conditions, the paper claims it cites (only one
  // paper's when onlyPaper is set), and the interpretation, observations, checks and decision record.
  function appendApplicationDetail(item, onlyPaper, meta, content) {
    if (onlyPaper) {
      byId('item-title').textContent =
        paperName(onlyPaper) + t(' · evidence linked to this question');
      appendPublication(meta, papers.get(onlyPaper));
    }
    meta.append(
      badge(t('Project decision · ') + item.decision.status),
      badge(t('Planned action · ') + (item.decision.action ?? t('Unspecified'))),
    );
    const context = section(t('Project conditions'));
    paragraphs(context, data.project.conditions, t('Project conditions not recorded'));
    if (item.conditions_comparison?.length) {
      const comparison = section(
        t('Differences between paper and project conditions'),
        'trace-comparison',
      );
      paragraphs(comparison, item.conditions_comparison, '');
      context.append(comparison);
    }
    const refs = section(t('Application evidence · paper claims and conditions'));
    claims(
      refs,
      item.claim_refs.filter((ref) => !onlyPaper || ref.paper_id === onlyPaper),
    );
    const interpretation = section(t('Project interpretation'), 'interpretation');
    interpretation.append(paragraph(item.interpretation));
    const observation = section(t('Project observations'), 'observation');
    paragraphs(
      observation,
      item.observations,
      t('No observations recorded · execution and results are unknown.'),
    );
    const checks = section(t('Suggested next checks'), 'checks');
    paragraphs(checks, item.next_checks, t('No next-check proposals recorded'));
    const decision = section(t('Adoption decision record'), 'decision');
    decision.append(
      paragraph(
        t('Status: ') +
          item.decision.status +
          t(' · action: ') +
          (item.decision.action ?? t('Unspecified')),
      ),
      paragraph(item.decision.rationale),
      node(
        'p',
        'section-note',
        t('Project adoption does not establish source verification or experiment reproduction.'),
      ),
    );
    content.append(context, refs, interpretation, observation, checks, decision);
  }
  // On first maps the edition and date sources are folded under the publication date.
  function appendEditionDetails(meta, item, firstMap) {
    let editionHost = meta;
    if (firstMap) {
      editionHost = node('div', 'edition-fold-body');
      const fold = node('details', 'edition-fold');
      fold.append(node('summary', '', t('Edition and date source')), editionHost);
      appendPublication(meta, item, editionHost);
      meta.append(fold);
    } else appendPublication(meta, item);
    editionHost.append(badge(t('Edition · ') + (item.edition ?? t('Not recorded'))));
  }
  // The eyebrow says why this card is on the map: the focal paper or the concept it supports.
  // The title names the concept the reader came through. Opened directly, a paper names the concept
  // it hangs under on the map, or else the first concept that suggests it.
  function labelFirstMapPosition(item, backgroundReading) {
    const entry = backgroundReading?.background;
    const conceptId =
      entry?.concept_id ??
      plan.owner.get(item.id) ??
      plan.order.find((id) => plan.readings.get(id).includes(item.id));
    if (data.focal_paper_id === item.id) byId('position').textContent = t('Focal paper');
    else if (conceptId) {
      const number = plan.order.indexOf(conceptId) + 1;
      // Folded training and evaluation concepts have no map number, so they are named without one.
      const label = number
        ? t('Concept {number} · {title}', { number, title: concepts.get(conceptId).title })
        : concepts.get(conceptId).title;
      const firstReading = entry ? entry.readings[0]?.paper_id : plan.readings.get(conceptId)?.[0];
      byId('position').textContent =
        label + (firstReading === item.id ? '' : ' · ' + t('Also read'));
    }
  }
  // A paper reached as a background reading: where to read it (on the main map) and the way back.
  function appendBackgroundReturn(content, item, { background, reading }) {
    const returning = section(t('Return and compare'));
    const inMainMap = scene === 'papers';
    if (inMainMap) {
      const locations = section(t('Background reading'));
      locations.append(paragraph(reading.rationale));
      appendSourceLinks(locations, reading.evidence, { paperTitle: item.title });
      evidence(locations, reading.evidence);
      content.append(locations);
    }
    returning.append(
      paragraph(reading.return_question),
      localLink(
        'paper',
        background.paper_id,
        t('Return to current paper · ') + paperName(background.paper_id),
        'map-item',
      ),
      localLink(
        inMainMap ? 'concept-need' : 'background',
        background.id,
        t('Return to concept background · ') + concepts.get(background.concept_id).title,
        'map-item',
      ),
    );
    content.append(returning);
  }
  // A paper opened from the map still shows what to bring back from each concept that suggests it.
  // One section per concept: several backgrounds may suggest the same reading for the same concept.
  function appendReturnQuestions(content, item) {
    const questions = new Map();
    for (const background of backgrounds.values()) {
      const reading = background.readings.find((entry) => entry.paper_id === item.id);
      if (!reading?.return_question) continue;
      if (!questions.has(background.concept_id)) questions.set(background.concept_id, new Set());
      questions.get(background.concept_id).add(reading.return_question);
    }
    for (const [conceptId, texts] of questions) {
      const returning = section(t('Return and compare') + ' · ' + concepts.get(conceptId).title);
      for (const text of texts) returning.append(node('p', 'return-box', text));
      content.append(returning);
    }
  }
  function appendPaperConnections(content, item, firstMap) {
    const incident = data.relations.filter(
      (relation) => relation.source === item.id || relation.target === item.id,
    );
    const connections = section(t('Connections for this paper'));
    if (!incident.length)
      connections.append(
        node(
          'p',
          'empty-note',
          t('No linked relations recorded · this does not establish that no relations exist.'),
        ),
      );
    for (const relation of incident) {
      // First maps list relations as quiet rows with the same line sample as the map.
      const link = localLink(
        'relation',
        relation.id,
        paperName(relation.source) +
          ' → ' +
          paperName(relation.target) +
          ' · ' +
          kindLabels[relation.kind],
        firstMap ? 'relation-row' : 'map-item',
      );
      if (firstMap) link.dataset.category = presentation.category(relation);
      connections.append(link);
    }
    content.append(connections);
  }
  // On first maps the full claim records stay available but folded, so the panel reads as a reading guide.
  function appendClaimRecords(content, item, firstMap) {
    const host = firstMap ? node('details', 'claims-fold') : content;
    if (firstMap) {
      host.append(
        node('summary', '', t('Show all claim records · {count}', { count: item.claims.length })),
      );
      content.append(host);
    }
    if (item.notes?.length) {
      const notes = section(t('Card conditions, comparisons and interpretations'));
      appendNotes(notes, item.notes);
      host.append(notes);
    }
    const own = section(t('Claims and source locations for this paper'));
    if (!item.claims.length) own.append(node('p', 'empty-note', t('No claims recorded')));
    claims(
      own,
      item.claims.map((claim) => ({ paper_id: item.id, claim_id: claim.id })),
    );
    host.append(own);
  }
  // A paper: publication and edition, why and where to read it, how it was reached (a background
  // reading or the concepts that suggest it), its connections, metrics and claim records.
  function appendPaperDetail(item, backgroundReading, meta, content) {
    // First maps answer "why and where to read" first; edition provenance stays one click away.
    const firstMap = backgrounds.size > 0 && scene === 'papers';
    appendEditionDetails(meta, item, firstMap);
    if (firstMap) labelFirstMapPosition(item, backgroundReading);
    appendReadingReason(content, item);
    appendPaperSources(content, item, firstMap);
    if (!firstMap) appendPaperMetrics(content, item);
    if (backgroundReading) {
      appendBackgroundReturn(content, item, backgroundReading);
    } else {
      if (firstMap) appendReturnQuestions(content, item);
      appendConceptChoices(content, item);
    }
    appendPaperConnections(content, item, firstMap);
    if (firstMap) appendPaperMetrics(content, item);
    appendClaimRecords(content, item, firstMap);
  }
  function select(id, focus = false, onlyPaper, backgroundReading) {
    if (scene === 'context') mountMap(projectMode ? 'applications' : 'papers');
    const item =
      items.find((item) => item.id === id) ?? items.find((item) => item.id === data.start);
    selected = item.id;
    const index = items.indexOf(item);
    selectedType = projectMode ? 'application' : 'paper';
    highlight(selectedType, selected);
    byId('position').textContent = (projectMode ? t('APPLICATION · ') : t('PAPER · ')) + item.id;
    byId('item-title').textContent = item.title;
    const meta = byId('metadata'),
      content = byId('content');
    meta.replaceChildren();
    content.replaceChildren();
    if (projectMode) appendApplicationDetail(item, onlyPaper, meta, content);
    else appendPaperDetail(item, backgroundReading, meta, content);
    byId('previous').disabled = index === 0;
    byId('next').disabled = index === items.length - 1;
    byId('current-count').textContent = index + 1 + ' / ' + items.length;
    byId('announcement').textContent = t('{title} selected', {
      title: byId('item-title').textContent,
    });
    if (focus) byId('item-title').focus();
  }
  function highlight(type, id, paperId) {
    for (const [key, a] of nav) {
      if (key === type + ':' + id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
    map?.select(type, id, paperId);
  }
  function appendLinkedApplications(content, id) {
    const connected = section(t('Application records linked by this project'));
    const linked = items.filter((app) => app.claim_refs.some((ref) => ref.paper_id === id));
    if (!linked.length)
      connected.append(
        node(
          'p',
          'empty-note',
          t('No application referencing this paper is included in the input scope.'),
        ),
      );
    for (const app of linked)
      connected.append(
        localLink(
          'reference',
          app.id + ':' + id,
          app.title +
            ' · ' +
            app.decision.status +
            ' · ' +
            app.claim_refs.filter((ref) => ref.paper_id === id).length +
            t(' claims'),
          'map-item',
        ),
      );
    content.append(connected);
  }
  function showProjectPaper(id, focus) {
    const paper = papers.get(id);
    if (!paper) return false;
    if (scene !== 'applications') mountMap('applications');
    const content = byId('content'),
      meta = byId('metadata');
    content.replaceChildren();
    meta.replaceChildren();
    byId('position').textContent = t('PAPER · ') + paper.id;
    byId('item-title').textContent = paper.title;
    appendPublication(meta, paper);
    meta.append(badge(t('Edition · ') + (paper.edition ?? t('Not recorded'))));
    appendReadingReason(content, paper);
    appendPaperSources(content, paper);
    appendPaperMetrics(content, paper);
    appendLinkedApplications(content, id);
    const own = section(t('Claims and source locations for this paper'));
    claims(
      own,
      paper.claims.map((claim) => ({ paper_id: id, claim_id: claim.id })),
    );
    if (!paper.claims.length) own.append(node('p', 'empty-note', t('No claims recorded')));
    content.append(own);
    if (paper.notes?.length) {
      const notes = section(t('Card conditions, comparisons and interpretations'));
      appendNotes(notes, paper.notes);
      content.append(notes);
    }
    selected = id;
    selectedType = 'paper';
    byId('previous').disabled = true;
    byId('next').disabled = true;
    byId('current-count').textContent = t('Paper and application connections');
    highlight('paper', id);
    byId('announcement').textContent = t('{title} selected', { title: paper.title });
    if (focus) byId('item-title').focus();
    return true;
  }
  // A context link opens on its route: the reason, both concepts, then the destination's explanation.
  function appendTopicRoute(content, relation, topic) {
    content.append(
      paragraph(relation.label),
      node('p', 'origin-note', data.project_context.notice),
      localLink(
        'topic',
        relation.source,
        t('Starting concept · ') + topics.get(relation.source).title,
        'map-item',
      ),
      localLink('topic', relation.target, t('Destination concept · ') + topic.title, 'map-item'),
      node('h3', '', topic.title + t(' · destination concept explanation')),
    );
  }
  // The paper claims behind a topic, how project and source conditions differ, and the way to the
  // full project record.
  function appendTopicEvidence(content, topic, relation) {
    const refs = section(
      (relation ? topic.title + t(' · destination concept') : t('This concept')) +
        t(' · linked paper evidence'),
    );
    claims(refs, topic.claim_refs);
    if (!topic.claim_refs.length)
      refs.append(
        node(
          'p',
          'empty-note',
          t('This item provides background. No paper claims are invented to fill it.'),
        ),
      );
    content.append(refs);
    const app = data.applications.find((app) => app.id === data.start);
    if (topic.claim_refs.length && app.conditions_comparison?.length) {
      const comparison = section(
        t('Distinguish project and source conditions'),
        'trace-comparison',
      );
      paragraphs(comparison, app.conditions_comparison, '');
      content.append(comparison);
    }
    content.append(
      localLink('application', data.start, t('View project decisions and all evidence')),
    );
  }
  // Topics step through the context list; a context link has no previous or next.
  function setTopicPaging(topic, relation) {
    const index = data.project_context.items.indexOf(topic);
    byId('previous').disabled = !!relation || index === 0;
    byId('next').disabled = !!relation || index === topics.size - 1;
    byId('current-count').textContent = relation
      ? t('Select the starting or destination concept to continue reading')
      : index + 1 + ' / ' + topics.size;
  }
  function showTopic(id, focus, relationIndex) {
    const relation = relationIndex === undefined ? null : data.project_context.links[relationIndex];
    const topic = topics.get(relation ? relation.target : id);
    if (!topic) return false;
    if (scene !== 'context') mountMap('context');
    selected = topic.id;
    selectedType = relation ? 'context-link' : 'topic';
    const content = byId('content'),
      meta = byId('metadata');
    content.replaceChildren();
    meta.replaceChildren();
    byId('position').textContent = t('PROJECT CONTEXT · ') + topic.id;
    byId('item-title').textContent = relation
      ? topics.get(relation.source).title + ' → ' + topic.title
      : topic.title;
    meta.append(badge(t('Learning guidance')));
    if (relation) appendTopicRoute(content, relation, topic);
    content.append(node('p', 'lead', topic.summary));
    topic.body.forEach((value) => content.append(paragraph(value)));
    const example = section(t('Explore an example'), 'example');
    example.append(paragraph(topic.example));
    content.append(example);
    appendTopicEvidence(content, topic, relation);
    setTopicPaging(topic, relation);
    highlight(relation ? 'context-link' : 'topic', relation ? String(relationIndex) : topic.id);
    byId('announcement').textContent = t('{title} selected', {
      title: byId('item-title').textContent,
    });
    if (focus) byId('item-title').focus();
    return true;
  }
  function appendRelationEvidence(parent, relation) {
    const refs = section(t('Source evidence'));
    if (!relation.evidence_refs.length) {
      refs.append(
        node(
          'p',
          'empty-note',
          t(
            relation.origin === 'ai'
              ? 'This suggestion has no linked source evidence. Do not use it as a source-confirmed relationship.'
              : 'No source evidence is linked. Do not use this as a source-confirmed relationship.',
          ),
        ),
      );
    } else {
      if (relation.origin === 'ai') {
        refs.append(
          node(
            'p',
            'section-note',
            t('These claims inform a reading suggestion, not a source-confirmed relationship.'),
          ),
        );
      }
      const evidenceIds = relation.evidence_refs.flatMap(
        (ref) => referencedClaim(ref).claim.evidence,
      );
      appendSourceLinks(refs, evidenceIds);
      claims(refs, relation.evidence_refs);
    }
    parent.append(refs);
  }
  function showRelation(id, focus) {
    const index = data.relations?.findIndex((relation) => relation.id === id) ?? -1;
    if (index < 0) return false;
    const relation = data.relations[index];
    if (scene === 'background') mountMap('papers');
    select(relation.source, false);

    const meta = byId('metadata');
    const content = byId('content');
    meta.replaceChildren();
    content.replaceChildren();
    const number = String(index + 1).padStart(2, '0');
    byId('position').textContent = t('RELATION {number} · ', { number }) + relation.id;
    byId('item-title').textContent = kindLabels[relation.kind];
    meta.append(badge(relationLabel(relation), relation.needs_recheck));
    if (relation.needs_recheck)
      meta.append(
        badge(t('Needs rechecking · a previous check is not treated as currently valid.'), true),
      );

    const direction = section(t('Relation direction'));
    direction.append(paragraph(paperName(relation.source) + ' → ' + paperName(relation.target)));
    const reason = section(t('Why these records are connected'));
    reason.append(paragraph(relation.rationale));
    content.append(direction, reason);
    appendRelationEvidence(content, relation);

    const history = node('details', 'source');
    history.append(
      node('summary', '', t('Relation authorship and source-check record')),
      paragraph(relation.created_by),
    );
    if (relation.review)
      history.append(paragraph(relation.review.checked_by + ' · ' + relation.review.checked_at));
    content.append(history);

    selectedType = 'relation';
    selected = id;
    byId('previous').disabled = true;
    byId('next').disabled = true;
    byId('current-count').textContent = t('Selected relation matches the map');
    highlight('relation', id);
    byId('announcement').textContent = t('{title} selected', {
      title: byId('item-title').textContent,
    });
    if (focus) byId('item-title').focus();
    return true;
  }
  function showOverview(focus) {
    if (scene === 'background') mountMap('papers');
    const content = byId('content'),
      meta = byId('metadata');
    content.replaceChildren();
    meta.replaceChildren();
    byId('position').textContent = t('RELATION OVERVIEW');
    byId('item-title').textContent = t('From relations to source evidence');
    meta.append(
      badge(data.papers.length + t(' papers · ') + data.relations.length + t(' relations')),
    );
    content.append(
      paragraph(
        t(
          'Select an edge or the corresponding relation below to inspect the claims and conditions connecting the two papers.',
        ),
      ),
    );
    content.append(
      paragraph(
        t(
          'Select a paper to highlight its relations. Open the relation overview or press Escape to clear the selection.',
        ),
      ),
    );
    content.append(
      node(
        'p',
        'origin-note',
        t('Whole-paper status, individual claim checks and relation-check records are separate.'),
      ),
    );
    selectedType = 'overview';
    byId('previous').disabled = true;
    byId('next').disabled = true;
    byId('current-count').textContent = t('Explore the map and evidence together');
    highlight('', '');
    byId('announcement').textContent = t('{title} selected', {
      title: byId('item-title').textContent,
    });
    if (focus) byId('item-title').focus();
  }
  // The route in the hash: its type, and its decoded ID, or '' when there is no route or the ID is malformed.
  function hashRoute() {
    const match = /^#([a-z-]+)=(.*)$/.exec(location.hash);
    let id;
    try {
      id = match ? decodeURIComponent(match[2]) : '';
    } catch {
      id = '';
    }
    return { type: match?.[1], id };
  }
  // Concept, background, topic and context-link routes; false when the ID names nothing.
  function showGuideRoute(type, id, focus) {
    if (['concept', 'concept-need', 'background'].includes(type) && showConcept(id, focus, type))
      return true;
    if (
      ['background-reading', 'background-paper'].includes(type) &&
      showBackgroundPaper(id, focus, type)
    )
      return true;
    if (type === 'topic' && showTopic(id, focus)) return true;
    return (
      type === 'context-link' &&
      /^\d+$/.test(id) &&
      !!data.project_context?.links[Number(id)] &&
      showTopic('', focus, Number(id))
    );
  }
  // A project reference opens its application with only that paper's evidence.
  function showReference(id, focus) {
    const [appId, paperId, extra] = id.split(':'),
      app = items.find((item) => item.id === appId);
    if (extra || !app?.claim_refs.some((ref) => ref.paper_id === paperId)) return false;
    select(appId, focus, paperId);
    highlight('reference', id, paperId);
    return true;
  }
  // Relation, reference, paper and application routes; false when the ID names nothing.
  function showRecordRoute(type, id, focus) {
    if (type === 'relation' && showRelation(id, focus)) return true;
    if (type === 'reference' && projectMode && showReference(id, focus)) return true;
    if (type === 'paper' && projectMode && showProjectPaper(id, focus)) return true;
    if (type === (projectMode ? 'application' : 'paper') && items.some((item) => item.id === id)) {
      if (scene === 'background') mountMap('papers');
      select(id, focus);
      return true;
    }
    return false;
  }
  function followHash(focus = false) {
    const { type, id } = hashRoute();
    if (showGuideRoute(type, id, focus) || showRecordRoute(type, id, focus)) return;
    if (projectMode && data.map_view === 'context') {
      showTopic(data.project_context.start, focus);
    } else if (projectMode || !location.hash) {
      if (scene === 'background') mountMap('papers');
      select(data.start, focus);
    } else {
      showOverview(focus);
    }
  }
  // Previous and next step through topics on the context map, otherwise through the items.
  function bindPaging() {
    for (const [button, offset] of [
      ['previous', -1],
      ['next', 1],
    ])
      byId(button).addEventListener('click', () => {
        const sequence = selectedType === 'topic' ? data.project_context.items : items;
        const item = sequence[sequence.findIndex((item) => item.id === selected) + offset];
        if (item)
          location.hash =
            (selectedType === 'topic' ? '#topic=' : prefix) + encodeURIComponent(item.id);
      });
  }
  bindPaging();
  byId('skip').addEventListener('click', (event) => {
    event.preventDefault();
    byId('item-title').focus();
  });
  byId('fit-map').addEventListener('click', () => map?.fit());
  byId('zoom-in').addEventListener('click', () => map?.zoom(1.2));
  byId('zoom-out').addEventListener('click', () => map?.zoom(1 / 1.2));
  // Explorer controls keep their focus; the explicit evidence button moves to detail.
  window.addEventListener('hashchange', () =>
    followHash(!document.activeElement?.closest?.('.graph-explorer')),
  );
  window.addEventListener('keydown', (event) => {
    if (
      event.key !== 'Escape' ||
      projectMode ||
      event.defaultPrevented ||
      selectedType === 'overview'
    )
      return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"], dialog'))
      return;
    location.hash = '#overview=all';
  });
  mountMap(scene);
  followHash();
})();
