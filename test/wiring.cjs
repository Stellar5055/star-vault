// Wiring tests: drive the page's real event handlers under DOM stubs.
// Catches the class of bug pure round-trip tests miss (unhidden panels,
// stale download links, unreset inputs). Runs in CI on push/PR.
// Run: node test/wiring.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) failures++; };

const idList = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
const dupes = idList.filter((id, i) => idList.indexOf(id) !== i);
check('no duplicate ids', dupes.length === 0);

const ids = new Set(idList);
const script = html.split('<script>')[1].split('</script>')[0];
function makeEl(id) {
  return {
    id, hidden: true, textContent: '', value: '', style: {}, src: '', disabled: false,
    _handlers: {},
    classList: { add() {}, remove() {} },
    addEventListener(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); },
    removeAttribute(attr) { delete this[attr]; },
    click() {},
  };
}
const els = {};
const sandbox = {
  document: {
    getElementById(id) { return ids.has(id) ? (els[id] || (els[id] = makeEl(id))) : null; },
    createElement() { return { click() {}, remove() {} }; },
    body: { appendChild() {} },
  },
  navigator: {},
  setTimeout,
  URL: { createObjectURL() { return 'blob:stub'; }, revokeObjectURL() {} },
  Blob, TextEncoder, TextDecoder,
  crypto: require('crypto').webcrypto,
  console,
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
check('page script loads without throwing', true);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function dropOn(zoneId, file) {
  const zone = sandbox.document.getElementById(zoneId);
  for (const h of (zone._handlers['drop'] || [])) await h({ preventDefault() {}, dataTransfer: { files: [file] } });
  await sleep(100);
}
const grab = id => sandbox.document.getElementById(id);

(async () => {
  // store: drop shows size, input resets so the same file can be picked again
  const data = new TextEncoder().encode('hello-wiring');
  const file = { name: 'a.txt', size: data.length,
    arrayBuffer: async () => data.buffer,
    text: async () => new TextDecoder().decode(data) };
  await dropOn('store-drop', file);
  check('store shows file size', grab('store-meta').textContent.includes('12 B'));
  check('store input cleared for reselect', grab('store-input').value === '');

  // store: encode shows progress then restores the button
  const btn = { disabled: false, textContent: 'Make night sky' };
  await grab('store-go').onclick({ target: btn });
  check('store button restored after encode', btn.disabled === false && btn.textContent === 'Make night sky');
  check('store output visible', grab('store-out').hidden === false);

  // retrieve: image decodes with decoded preview, sky hidden
  const svgImg = vm.runInContext(`toSVG(pack('cat.jpg', new TextEncoder().encode('fake-image-bytes')))`, sandbox);
  await dropOn('ret-drop', { name: 'cat.jpg.sky.svg', size: svgImg.length, text: async () => svgImg });
  check('image decode shows result', grab('ret-info').hidden === false && grab('ret-name').textContent === 'cat.jpg');
  check('image decode shows image, hides sky', grab('ret-preview').hidden === false && grab('ret-sky-wrap').hidden === true);

  // retrieve: non-image shows sky fallback with the dropped file's size
  const svgTxt = vm.runInContext(`toSVG(pack('notes.txt', new TextEncoder().encode('hi')))`, sandbox);
  await dropOn('ret-drop', { name: 'notes.txt.sky.svg', size: svgTxt.length, text: async () => svgTxt });
  check('text decode shows sky fallback with size',
    grab('ret-sky-wrap').hidden === false && grab('ret-preview').hidden === true &&
    grab('ret-sky-meta').textContent.includes('notes.txt.sky.svg'));

  // retrieve: garbage errors cleanly with no stale download link
  await dropOn('ret-drop', { name: 'evil.svg', size: 11, text: async () => '<svg></svg>' });
  check('bad file shows error, hides download',
    grab('ret-err').hidden === false && grab('ret-dl').style.display === 'none');
  check('bad file clears download href', grab('ret-dl').href === undefined);

  // retrieve: paste path decodes too
  grab('ret-paste').value = svgImg;
  await grab('ret-paste-go').onclick();
  await sleep(100);
  check('paste path decodes',
    grab('ret-info').hidden === false && grab('ret-name').textContent === 'cat.jpg' &&
    grab('ret-sky-wrap').hidden === true);

  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS THREW:', e); process.exit(2); });
