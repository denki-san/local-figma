import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const exec=promisify(execFile),repository=fileURLToPath(new URL('../',import.meta.url));
test('macOS应用真实构建、运行时白名单与已有输出保护',{skip:process.platform!=='darwin',timeout:90000},async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'test_macos_bundle_'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const output=path.join(temp,'new');
  const built=JSON.parse((await exec(process.execPath,['macos/build.mjs',output],{cwd:repository})).stdout);
  assert.equal(built.installed,false);assert.equal(built.signed,false);assert.equal(built.uiVerified,false);
  const contents=path.join(built.app,'Contents');
  await exec('/usr/bin/plutil',['-lint',path.join(contents,'Info.plist')]);
  assert((await fs.stat(path.join(contents,'MacOS/local-figma'))).size>0);
  const runtime=path.join(contents,'Resources/runtime');
  assert.deepEqual((await fs.readdir(runtime)).sort(),['LICENSE','bin','package.json','plugin','schemas','src']);
  async function compare(relative){
    const installed=path.join(runtime,relative),original=path.join(repository,relative);
    const stat=await fs.lstat(installed);assert(!stat.isSymbolicLink());
    if(stat.isDirectory())for(const name of await fs.readdir(installed))await compare(path.join(relative,name));
    else assert.deepEqual(await fs.readFile(installed),await fs.readFile(original));
  }
  for(const entry of await fs.readdir(runtime))await compare(entry);
  const binary=await fs.readFile(path.join(contents,'MacOS/local-figma'));
  await assert.rejects(exec(process.execPath,['macos/build.mjs',output],{cwd:repository}));
  assert.deepEqual(await fs.readFile(path.join(contents,'MacOS/local-figma')),binary);
});
