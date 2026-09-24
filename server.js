const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000, DB=path.join(__dirname,'data.json');
function read(){try{return JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){return {complaints:[]}}}
function write(d){fs.writeFileSync(DB,JSON.stringify(d,null,2))}
function send(res,code,data,type='application/json'){res.writeHead(code,{'Content-Type':type,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end(type.includes('json')?JSON.stringify(data):data)}
function body(req){return new Promise((ok,fail)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{ok(s?JSON.parse(s):{})}catch(e){fail(e)}})})}
const server=http.createServer(async(req,res)=>{if(req.method==='OPTIONS')return send(res,204,'');
try{if(req.url==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,service:'VAJRA NYAY BACKEND',time:new Date().toISOString()});
if(req.url.startsWith('/api/complaints')&&req.method==='GET'){const d=read(),q=new URL(req.url,'http://localhost').searchParams.get('q')?.toLowerCase()||'';return send(res,200,d.complaints.filter(x=>!q||String(x.id).toLowerCase().includes(q)||String(x.category||'').toLowerCase().includes(q)))}
if(req.url==='/api/complaints'&&req.method==='POST'){const x=await body(req),d=read();const i=d.complaints.findIndex(v=>v.id===x.id);if(i>=0)d.complaints[i]={...d.complaints[i],...x};else d.complaints.push(x);write(d);return send(res,201,{ok:true,complaint:x})}
if(req.url.startsWith('/api/complaints/')&&req.method==='GET'){const id=decodeURIComponent(req.url.split('/').pop()),x=read().complaints.find(v=>v.id===id);return x?send(res,200,x):send(res,404,{ok:false,error:'Case not found'})}
if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return fs.createReadStream(path.join(__dirname,'index.html')).pipe(res)}
send(res,404,{ok:false,error:'Not found'})}catch(e){send(res,500,{ok:false,error:e.message})}});
server.listen(PORT,()=>console.log(`VAJRA NYAY: http://localhost:${PORT}`));
