'use strict';
// Minimal asar packer/reader (Electron archive format), no dependencies.
// Layout: [uint32 4][uint32 headerPickleSize] [header pickle] [file data]
// header pickle: [uint32 payloadSize][uint32 jsonLen][json][pad to 4]
const fs = require('fs');
const path = require('path');

function pack(srcDir, outFile) {
  const files = fs.readdirSync(srcDir).filter(f => fs.statSync(path.join(srcDir, f)).isFile()).sort();
  const header = { files: {} };
  const blobs = [];
  let offset = 0;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(srcDir, f));
    header.files[f] = { size: buf.length, offset: String(offset) };
    blobs.push(buf);
    offset += buf.length;
  }
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const headerPickle = Buffer.alloc(8 + json.length + pad);
  headerPickle.writeUInt32LE(4 + json.length + pad, 0);
  headerPickle.writeUInt32LE(json.length, 4);
  json.copy(headerPickle, 8);
  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);
  fs.writeFileSync(outFile, Buffer.concat([sizePickle, headerPickle, ...blobs]));
  return files;
}

function read(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 4) throw new Error('bad size pickle');
  const headerSize = buf.readUInt32LE(4);
  const jsonLen = buf.readUInt32LE(12);
  const header = JSON.parse(buf.slice(16, 16 + jsonLen).toString('utf8'));
  const base = 8 + headerSize;
  const out = {};
  for (const [name, e] of Object.entries(header.files)) {
    const off = base + Number(e.offset);
    out[name] = buf.slice(off, off + e.size);
  }
  return out;
}

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'pack') console.log('packed:', pack(a, b).join(', '));
  else if (cmd === 'list') { for (const [n, d] of Object.entries(read(a))) console.log(n, d.length); }
  else console.log('usage: asar.js pack <dir> <out.asar> | list <file.asar>');
}
module.exports = { pack, read };
