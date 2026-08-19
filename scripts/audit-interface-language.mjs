import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'client/index.html'), 'utf8');
const languageLayer = readFileSync(resolve(root, 'client/soli-interface-enhancements.js'), 'utf8');
const markup = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const hasArabic = (value) => /[\u0600-\u06ff]/.test(value);
const translations = new Set();
const inlineReplacementSources = new Set(['ج.م', 'جنيه']);

for (const match of languageLayer.matchAll(/^\s*'([^']+)':\s*'[^']*',?$/gm)) {
  translations.add(normalize(match[1]));
}

const staticTexts = new Set();
for (const match of markup.matchAll(/>([^<>]*[\u0600-\u06ff][^<>]*)</g)) {
  const text = normalize(match[1]);
  if (text && hasArabic(text) && !text.includes('{{') && !text.includes('x-')) staticTexts.add(text);
}
for (const match of markup.matchAll(/(?:placeholder|title|aria-label|data-label)="([^"]*[\u0600-\u06ff][^"]*)"/g)) {
  const text = normalize(match[1]);
  if (text) staticTexts.add(text);
}

const hasTranslation = (text) => {
  const normalized = normalize(text);
  return translations.has(normalized)
    || [...translations].some((source) => normalized.startsWith(source) && normalized.length > source.length)
    || inlineReplacementSources.has(normalized);
};
const isRuntimeCoveredExpression = (text) => {
  const fragments = [...text.matchAll(/'([^']*)'/g)]
    .map((match) => normalize(match[1]))
    .filter((fragment) => hasArabic(fragment));
  return fragments.length > 0 && fragments.every(hasTranslation);
};
const runtimeCovered = [...staticTexts].filter((text) => !translations.has(text) && isRuntimeCoveredExpression(text));
const untranslated = [...staticTexts].filter((text) => !translations.has(text) && !isRuntimeCoveredExpression(text));
console.log(JSON.stringify({
  translatedStaticUiPhrases: staticTexts.size - untranslated.length,
  runtimeCoveredExpressions: runtimeCovered.length,
  untranslatedStaticUiPhrases: untranslated.length,
  untranslated: untranslated.sort(),
}, null, 2));
