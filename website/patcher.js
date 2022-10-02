"use strict";

let infoMsg = "";

function log(msg) {
  msg = "# " + msg;
  infoMsg += msg + "\n";
  console.log(msg);
}

const UF2_MAGIC_START0 = 0x0a324655; // "UF2\n"

const PICO_CFG_MAGIC0 = 0xadd6ec3d; //Both randomly generated
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
  if (read32(buf, 0) == UF2_MAGIC_START0)
    log("detected UF2 file");

  //Encode data
  let patchbuf = new TextEncoder().encode(patch);

  //Check if patch data already exists
  if (read32(buf, buf.length - 512 + 0x20) == PICO_CFG_MAGIC0 &&
      read32(buf, buf.length - 512 + 0x20 + 4) == PICO_CFG_MAGIC1)
  {
    log(`Found pico config data!`);
    //Cuts the array to where the data will be, converts it to a string and removes null characters
    log(new TextDecoder().decode(buf.slice(buf.length-472, buf.length-4)).replace(/\0/g, ''))
    if (patch)
    {
      log(`Patching pre-existing data!`);
      let start = buf.length-472;
      for (let i = 0; i < 468; i += 1) buf[start + i] = 0; //Blank out data section

      for (let i = 0; i < patchbuf.length; i += 1)
        buf[start + i] = patchbuf[i]; //Add our patch
      
      return buf;
    }
  }
  //Otherwise we need to add patch data onto the end
  else if (patch)
  {
    let BlocksNum = buf.length / 512;
    let newBlocksSum = BlocksNum + 1;
    //There isn't pre-existing config data, we need to add our own
    for (let off = 0; off < buf.length; off += 512)
      write32(buf, off + 24, newBlocksSum); //Update the total blocks number for each block

    var newBytes = new Uint8Array(512);
    for (let i = 0; i < 512; i += 1) newBytes[i] = buf[i]; //Copy the first 512 bytes from the old buf
    //Change sequential byte number
    write32(newBytes, 0x14, BlocksNum);
    //Set where the data should go (one more than the last one)
    write32(newBytes, 0xc, 0x10000000 + (BlocksNum << 8));
    for (let i = 0; i < 476; i += 1) newBytes[0x20 + i] = 0; //Blank out data section

    //Add our magic bytes
    write32(newBytes, 0x20, PICO_CFG_MAGIC0);
    write32(newBytes, 0x24, PICO_CFG_MAGIC1);

    for (let i = 0; i < patchbuf.length; i += 1)
      newBytes[0x28 + i] = patchbuf[i]; //Add our patch
    
    //add our new bytes onto the end
    var mergedArray = new Uint8Array(buf.length + newBytes.length);
    mergedArray.set(buf);
    mergedArray.set(newBytes, buf.length);
  }
  return mergedArray;
}