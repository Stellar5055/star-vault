// Verifies Star Vault encode/decode round-trips using the page's own code.
// Run: node test/roundtrip.cjs (also runs in CI on push/PR).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) failures++; };

// getElementById returns the first match, so dupes silently break wiring
const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
check('no duplicate ids', new Set(ids).size === ids.length);

const script = html.split('<script>')[1].split('</script>')[0];
function makeEl() {
  return {
    id: '', hidden: true, textContent: '', style: {}, src: '',
    _handlers: {},
    classList: { add() {}, remove() {} },
    addEventListener() {}, click() {},
  };
}
const idSet = new Set(ids);
const els = {};
const sandbox = {
  document: {
    getElementById(id) { return idSet.has(id) ? (els[id] || (els[id] = makeEl())) : null; },
    createElement() { return { click() {} }; },
  },
  navigator: {},
  URL: { createObjectURL() { return 'blob:ci'; }, revokeObjectURL() {} },
  Blob, TextEncoder, TextDecoder,
  crypto: require('crypto').webcrypto,
  console,
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
check('page script loads without throwing', true);

const pack = vm.runInContext('pack', sandbox);
const unpack = vm.runInContext('unpack', sandbox);
const toSVG = vm.runInContext('toSVG', sandbox);
const fromSVG = vm.runInContext('fromSVG', sandbox);

const cases = [
  ['hello.txt', new Uint8Array(Buffer.from('hello world'))],
  ['bytes.bin', Uint8Array.from({ length: 256 }, (_, i) => i)],
  ['empty.txt', new Uint8Array(0)],
];
for (const [name, bytes] of cases) {
  const back = unpack(fromSVG(toSVG(pack(name, bytes))));
  const same = Buffer.from(back.data).equals(Buffer.from(bytes));
  const sha = crypto.createHash('sha256').update(Buffer.from(back.data)).digest('hex').slice(0, 12);
  check(`round-trip ${name} (${bytes.length}B) sha ${sha}`, same && back.name === name);
}

// the committed example carrier must decode too
const ex = path.join(root, 'example.sky.svg');
if (fs.existsSync(ex)) {
  const back = unpack(fromSVG(fs.readFileSync(ex, 'utf8')));
  check(`example.sky.svg decodes (${back.name}, ${back.data.length}B)`, back.data.length > 0);
} else {
  check('example.sky.svg exists', false);
}

process.exit(failures ? 1 : 0);
