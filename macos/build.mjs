import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

// 输出目录必须全新；只复制运行时白名单，不携带任何本地会话或设计证据。
const repository=fileURLToPath(new URL('../',import.meta.url));
const output=process.argv[2];
if(process.platform!=='darwin'||!output)throw Error('在 macOS 执行：node macos/build.mjs <全新的输出目录>');
const directory=path.resolve(output);
await fs.mkdir(directory,{recursive:false,mode:0o700});
const app=path.join(directory,'local-figma.app'),contents=path.join(app,'Contents');
await fs.mkdir(path.join(contents,'MacOS'),{recursive:true});
const runtime=path.join(contents,'Resources','runtime');
await fs.mkdir(runtime,{recursive:true});
for(const entry of ['bin','src','plugin','schemas','package.json','LICENSE'])await fs.cp(path.join(repository,entry),path.join(runtime,entry),{recursive:true,errorOnExist:true,force:false,dereference:false});
await fs.writeFile(path.join(contents,'Info.plist'),`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>local-figma</string><key>CFBundleIdentifier</key><string>local.figma.launcher</string><key>CFBundleName</key><string>local-figma</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/></dict></plist>`,{flag:'wx'});
await promisify(execFile)('/usr/bin/xcrun',['swiftc','-swift-version','5','-framework','AppKit','-module-cache-path',path.join(directory,'test_module_cache'),path.join(repository,'macos/Launcher.swift'),'-o',path.join(contents,'MacOS','local-figma')]);
console.log(JSON.stringify({app,installed:false,signed:false,uiVerified:false}));
