import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export async function liveSourceFingerprint(root=fileURLToPath(new URL('..',import.meta.url))) {
  const files=['frontend/index.html','frontend/package-lock.json'];
  async function walk(dir) {
    for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})) {
      const file=dir+'/'+entry.name;
      if(entry.isDirectory())await walk(file);else files.push(file);
    }
  }
  await walk('frontend/src');
  const hash=createHash('sha256');
  for(const file of files.sort()) { hash.update(file+'\0');hash.update(await readFile(path.join(root,file)));hash.update('\0'); }
  return hash.digest('hex');
}
