// Minimal DOM host for exercising the shipped browser script's observable contracts.
// Layout, native fragment scrolling and CSP still require the real browser checks.
import { languageScript } from './view-language.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

export function openView(data, initialHash, { script, elementIds, navigation, prefix, title }) {
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
  for (const id of elementIds) {
    const element = new Element(
      ['previous', 'next'].includes(id) ? 'button' : id === 'skip' ? 'a' : 'div',
    );
    element.id = id;
  }
  elements.get('candidate').textContent = JSON.stringify(data);
  elements.get('skip').href = '#' + title;
  runInNewContext(languageScript(data.language ?? 'ko') + readFileSync(script, 'utf8'), {
    document,
    location,
    window: {
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
export function openLearningView(data, initialHash = '') {
  return openView(data, initialHash, {
    script: new URL('../assets/learning-view.js', import.meta.url),
    elementIds: [
      'candidate',
      'skip',
      'concepts',
      'count',
      'view-label',
      'position',
      'concept-title',
      'summary',
      'explanation',
      'example',
      'connections',
      'sources',
      'previous',
      'next',
      'current-count',
      'announcement',
    ],
    navigation: 'concepts',
    prefix: '#concept=',
    title: 'concept-title',
  });
}
