import { readFileSync } from 'node:fs';

// UI text only. Research prose, source titles, quotes and machine values stay intact.
const korean = JSON.parse(
  readFileSync(new URL('../assets/research-language.ko.json', import.meta.url), 'utf8'),
);
export const uiText = (language, text) =>
  language === 'ko' && Object.hasOwn(korean, text) ? korean[text] : text;
export function languageScript(language) {
  const labels = JSON.stringify(language === 'ko' ? korean : {}).replace(
    /[<>&\u2028\u2029]/g,
    (value) => `\\u${value.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return `(() => { const labels = ${labels}; window.DanseoText = (text, values = {}) => {
    const message = Object.hasOwn(labels, text) ? labels[text] : text;
    return message.replace(/\\{(\\w+)\\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  }; })();\n`;
}
