"use strict";

let infoMsg = "";

function log(msg) {
  msg = "# " + msg;
  infoMsg += msg + "\n";
  console.log(msg);
}

function help() {
  console.log(`
USAGE: node patch-cfg.js file.uf2 [patch.cf2]

Without .cf2 file, it will parse config in the UF2 file and print it out
(in .cf2 format).

With .cf2 file, it will patch in-place the UF2 file with specified config.
`);
  process.exit(1);
}

function readBin(fn) {
  const fs = require("fs");

  if (!fn) {
    console.log("Required argument missing.");
    help();
  }

  try {
    return fs.readFileSync(fn);
  } catch (e) {
    console.log("Cannot read file '" + fn + "': " + e.message);
    help();
  }
}
const configInvKeys = {};

const UF2_MAGIC_START0 = 0x0a324655; // "UF2\n"
const UF2_MAGIC_START1 = 0x9e5d5157; // Randomly selected
const UF2_MAGIC_END = 0x0ab16f30; // Ditto

const PICO_CFG_MAGIC0 = 0xadd6ec3d;
const PICO_CFG_MAGIC1 = 0x60277988;

let all_defines = {};

function err(msg) {
  log("Fatal error: " + msg);
  if (typeof window == "undefined") {
    process.exit(1);
  } else {
    throw new Error(msg);
  }
}

function read32(buf, off) {
  return (
    (buf[off + 0] |
      (buf[off + 1] << 8) |
      (buf[off + 2] << 16) |
      (buf[off + 3] << 24)) >>>
    0
  );
}

function write32(buf, off, v) {
  buf[off + 0] = v & 0xff;
  buf[off + 1] = (v >> 8) & 0xff;
  buf[off + 2] = (v >> 16) & 0xff;
  buf[off + 3] = (v >> 24) & 0xff;
}

//***************************************************************************************************************** */
//***************************************************************************************************************** */
//***************************************************************************************************************** */
//***************************************************************************************************************** */
function readWriteConfig(buf, patch) {
  let patchPtr = null;
  let origData = [];
  let cfgLen = 0;
  let isUF2 = false;
  let start = 32;
  if (
    read32(buf, 0) != UF2_MAGIC_START0 ||
    read32(buf, 4) != UF2_MAGIC_START1
  ) {
    isUF2 = true;
    log("detected UF2 file");
    payloadLen = read32(buf, 16);
    addr = read32(buf, 12) - 32;
  }

  //Check if patch data already exists
  if (
    read32(buf, buf.length - 1 + start) == PICO_CFG_MAGIC0 &&
    read32(buf, buf.length - 1 + start + 4) == PICO_CFG_MAGIC0
  ) {
    log(`Found pico config data!`);
    if (patch) {
      log(`Patching pre-existing data!`);
      for (let i = start + 8; i < start + payloadLen; i += 4) {
        if (i - (start + 8) < patch.length)
          write32(buf, buf.length - 1 + i, patch[i - (start + 8)]);
        else write32(buf, buf.length - 1 + i, 0);
      }
    }
  } else if (patch) {
    let BlocksNum = buf.length / 512;
    let newBlocksSum = BlocksNum + 1;
    //There isn't pre-existing config data, we need to add our own
    for (let off = 0; off < buf.length; off += 512)
      write32(buf, off + 24, newBlocksSum); //Update the total blocks number for each block

    var newBytes = new Uint8Array(512);
    for (let i = 0; i < 512; i += 1) newBytes[i] = buf[i]; //Copy the first 512 bytes from the old buf
    //Change sequential byte number
    write32(newBytes, 20, BlocksNum);
    //Set where the data should go (one more than the last one)
    write32(newBytes,12, 0x10000000 + (BlocksNum << 8));
    for (let i = 0; i < 476; i += 1) newBytes[0x20 + i] = 0; //Blank out data section


    //Encode data
    if (!("TextEncoder" in window)) 
      log("Sorry, this browser does not support TextEncoder...");
    let enc = new TextEncoder();
    let patchbuf = enc.encode(patch);

    for (let i = 0; i < patchbuf.length; i += 1)
      newBytes[0x20 + i] = patchbuf[i]; //Add our patch
    
    //add our new bytes onto the end
    var mergedArray = new Uint8Array(buf.length + newBytes.length);
    mergedArray.set(buf);
    mergedArray.set(newBytes, buf.length);
  }
  return mergedArray;
}

function main() {
  let uf2 = readBin(process.argv[2]);

  if (process.argv[3]) {
    let cfg = readBin(process.argv[3]).toString("utf8");
    let r = patchConfig(uf2, cfg);
    if (!r.changes) console.log("No changes.");
    else console.log("\nChanges:\n" + r.changes);
    console.log("# Writing config...");
    fs.writeFileSync(process.argv[2], r.patched);
  } else {
    console.log(readConfig(uf2));
  }
}

if (typeof window == "undefined") main();
