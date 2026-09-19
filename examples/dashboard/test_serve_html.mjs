import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
// 仅提供指定目录的单页HTML，监听回环地址，不开放目录列表或其它文件。
if(!process.argv[2])throw Error('用法：node test_serve_html.mjs <HTML输出目录>');
const file=path.resolve(process.argv[2],'index.html');
await fs.access(file);
const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET' || !['/','/index.html'].includes(req.url)){res.writeHead(404);res.end();return;}
  try{const html=await fs.readFile(file);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(html);}
  catch{res.writeHead(500);res.end('页面暂不可用');}
});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port));
process.once('SIGINT',()=>server.close());process.once('SIGTERM',()=>server.close());
