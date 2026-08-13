import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1].trim())
  .filter(Boolean);

if (scripts.length === 0) {
  throw new Error('No inline JavaScript block was found in client/index.html');
}

scripts.forEach((source, index) => {
  new vm.Script(source, { filename: `client/index.html:inline-script-${index + 1}` });
});

if (/value="admin"|value="1234"/.test(html)) {
  throw new Error('Default login credentials are still present in the HTML');
}

console.log(`Inline JavaScript syntax: PASS (${scripts.length} block${scripts.length === 1 ? '' : 's'})`);
console.log('Default login credential check: PASS');
