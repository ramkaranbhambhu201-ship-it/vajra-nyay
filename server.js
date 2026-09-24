const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
// Load local .env without exposing the key to the browser.
const ENV_FILE=path.join(__dirname,'.env');
if(fs.existsSync(ENV_FILE)){
  try{
    for(const line of fs.readFileSync(ENV_FILE,'utf8').split(/\r?\n/)){
      const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if(m && !process.env[m[1]]) process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
    }
  }catch(e){}
}
const PORT=process.env.PORT||3000,DB=path.join(__dirname,'data.json'),SOS_DIR=path.join(__dirname,'sos_live');
const CONSTITUTION_KB=(()=>{try{return JSON.parse(fs.readFileSync(path.join(__dirname,'constitution_kb.json'),'utf8'))}catch(e){return {parts:[],schedules:[],key_articles:{}}}})();
const LAW_DB=path.join(__dirname,'law_updates.json');
const OFFICIAL_SOURCES={
  indiaCode:'https://www.indiacode.nic.in/indiacode/home.jsp',
  indiaCodeHi:'https://www.indiacode.nic.in/indiacode/?locale=hi',
  legislative:'https://www.legislative.gov.in/'
};
function readLawDb(){try{return JSON.parse(fs.readFileSync(LAW_DB,'utf8'))}catch(e){return {lastChecked:null,sources:OFFICIAL_SOURCES,acts:[],amendments:[]}}}
function writeLawDb(d){fs.writeFileSync(LAW_DB,JSON.stringify(d,null,2))}
function getText(url,timeout=15000){return new Promise((resolve,reject)=>{try{const u=new URL(url),lib=u.protocol==='https:'?https:http;const rq=lib.get({hostname:u.hostname,port:u.port||undefined,path:u.pathname+u.search,headers:{'User-Agent':'Vajra-Nyay-Law-Update-Checker/1.0','Accept':'text/html,application/xhtml+xml'}},r=>{let z='';r.setEncoding('utf8');r.on('data',c=>z+=c);r.on('end',()=>{if(r.statusCode>=200&&r.statusCode<300)resolve(z);else reject(new Error('HTTP '+r.statusCode))})});rq.setTimeout(timeout,()=>{rq.destroy(new Error('timeout'))});rq.on('error',reject)}catch(e){reject(e)}})}
function stripHtml(x){return String(x||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim()}
function parseIndiaCodeActs(html){
  const text=stripHtml(html); const found=[];
  const re=/(\\d{1,2}[-\\/](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\\/]\\d{4}|\\d{1,2}[-\\/]\\d{1,2}[-\\/]\\d{4})\\s+([0-9]{1,3})\\s+([A-Za-z][A-Za-z0-9 ,()&.'’\\-]{4,160}?)(?=\\s+(?:\\d{1,2}[-\\/]|$))/gi;
  let m; while((m=re.exec(text))&&found.length<300){const title=m[3].replace(/\\s+/g,' ').trim(); if(title&&!/View$/i.test(title))found.push({enactmentDate:m[1],actNo:m[2],title,source:OFFICIAL_SOURCES.indiaCode})}
  const uniq=new Map(); for(const a of found)uniq.set((a.actNo+'|'+a.title).toLowerCase(),a); return [...uniq.values()];
}
async function syncOfficialLawCatalog(force=false){
  const db=readLawDb(); const now=Date.now(); if(!force&&db.lastChecked&&now-new Date(db.lastChecked).getTime()<24*60*60*1000)return db;
  let acts=[]; let errors=[];
  try{const html=await getText('https://www.indiacode.nic.in/indiacode/handle/123456789/1362/simple-search?order=desc&query=&rpp=100&sort_by=score');acts=parseIndiaCodeActs(html)}catch(e){errors.push('India Code: '+e.message)}
  db.lastChecked=new Date().toISOString(); db.sources=OFFICIAL_SOURCES; db.acts=acts; db.errors=errors; db.updatePolicy='Automatic official-source check; new entries are catalogued, not silently treated as verified legal text.'; writeLawDb(db); return db;
}
function scheduleLawSync(){syncOfficialLawCatalog(false).catch(()=>{});setInterval(()=>syncOfficialLawCatalog(false).catch(()=>{}),24*60*60*1000)}
function relevantLawContext(q){
  const db=readLawDb(),s=String(q||'').toLowerCase(); const terms=s.split(/[^\\p{L}\\p{N}]+/u).filter(x=>x.length>3); if(!terms.length)return '';
  const hits=(db.acts||[]).filter(a=>terms.some(t=>String(a.title).toLowerCase().includes(t))).slice(0,8);
  if(!hits.length)return ''; return hits.map(a=>`Official India Code catalog: ${a.title} (Act No. ${a.actNo}, enactment ${a.enactmentDate})`).join('\\n');
}

if(!fs.existsSync(SOS_DIR))fs.mkdirSync(SOS_DIR,{recursive:true});
function read(){try{return JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){return {complaints:[],petitions:[],whistle:[]}}}
function write(d){fs.writeFileSync(DB,JSON.stringify(d,null,2))}
function send(res,code,data,type='application/json'){res.writeHead(code,{'Content-Type':type,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end(type.includes('json')?JSON.stringify(data):data)}
function body(req){return new Promise((ok,fail)=>{let s='';req.on('data',c=>{s+=c;if(s.length>15*1024*1024)req.destroy()});req.on('end',()=>{try{ok(s?JSON.parse(s):{})}catch(e){fail(e)}})})}
function forwardPolice(payload){return new Promise(resolve=>{const target=process.env.POLICE_LIVE_ENDPOINT;if(!target)return resolve(false);try{const u=new URL(target),lib=u.protocol==='https:'?https:http;const req=lib.request({method:'POST',hostname:u.hostname,port:u.port||undefined,path:u.pathname+u.search,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(JSON.stringify(payload))}},r=>{r.resume();resolve(r.statusCode>=200&&r.statusCode<300)});req.on('error',()=>resolve(false));req.write(JSON.stringify(payload));req.end()}catch(e){resolve(false)}})}
async function groqChat(messages,maxTokens=700){
  const key=process.env.GROQ_API_KEY;
  if(!key) return {configured:false};
  const payload=JSON.stringify({model:process.env.GROQ_MODEL||'openai/gpt-oss-20b',messages,temperature:0.1,max_tokens:maxTokens});
  const u=new URL('https://api.groq.com/openai/v1/chat/completions');
  return await new Promise((resolve,reject)=>{
    const rq=https.request({method:'POST',hostname:u.hostname,path:u.pathname,headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},r=>{
      let z=''; r.on('data',c=>z+=c); r.on('end',()=>{try{resolve({configured:true,status:r.statusCode,data:JSON.parse(z)})}catch(e){reject(e)}});
    });
    rq.setTimeout(30000,()=>{rq.destroy(new Error('Groq timeout'))});
    rq.on('error',reject); rq.write(payload); rq.end();
  });
}

const server=http.createServer(async(req,res)=>{if(req.method==='OPTIONS')return send(res,204,'');try{
if(req.url==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,service:'VAJRA NYAY BACKEND',groqConfigured:!!process.env.GROQ_API_KEY,groqModel:process.env.GROQ_MODEL||'openai/gpt-oss-20b',policeLiveConfigured:!!process.env.POLICE_LIVE_ENDPOINT,govApiConfigured:!!process.env.GOV_API_ENDPOINT,lawUpdateLastChecked:readLawDb().lastChecked,lawUpdateSource:'India Code + Legislative Department',time:new Date().toISOString()});
if(req.url==='/api/config'&&req.method==='GET')return send(res,200,{ok:true,groqConfigured:!!process.env.GROQ_API_KEY,groqModel:process.env.GROQ_MODEL||'openai/gpt-oss-20b',policeLiveConfigured:!!process.env.POLICE_LIVE_ENDPOINT,govApiConfigured:!!process.env.GOV_API_ENDPOINT});
if(req.url==='/api/sos/chunk'&&req.method==='POST'){const x=await body(req);if(!x.sessionId||!x.videoBase64)return send(res,400,{ok:false,error:'Missing SOS chunk'});const safe=String(x.sessionId).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);const dir=path.join(SOS_DIR,safe);if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});const raw=Buffer.from(x.videoBase64,'base64');const hash=crypto.createHash('sha256').update(raw).digest('hex');const fn=String(Number.isFinite(Number(x.chunkIndex))?x.chunkIndex:0).padStart(8,'0')+'.webm';fs.writeFileSync(path.join(dir,fn),raw);fs.writeFileSync(path.join(dir,'manifest.jsonl'),JSON.stringify({sessionId:safe,chunkIndex:x.chunkIndex,sha256:hash,createdAt:x.createdAt,lat:x.lat??null,lng:x.lng??null,mimeType:x.mimeType||'video/webm'})+'\n',{flag:'a'});const forwarded=await forwardPolice({...x,sha256:hash});return send(res,201,{ok:true,stored:true,sha256:hash,forwarded});}
if(req.url==='/api/evidence/stamp'&&req.method==='POST'){const x=await body(req);if(!x.sha256)return send(res,400,{ok:false,error:'sha256 required'});return send(res,201,{ok:true,stampId:'ST-'+crypto.randomBytes(6).toString('hex').toUpperCase(),sha256:x.sha256,createdAt:new Date().toISOString(),anchoring:'HASH_TIMESTAMP_ONLY'});}
if(req.url==='/api/petitions'&&req.method==='POST'){const x=await body(req),d=read();d.petitions=d.petitions||[];const item={id:'JV-'+Date.now().toString(36).toUpperCase(),text:String(x.text||'').slice(0,5000),target:Number(x.target||0),raised:0,anonymous:true,time:new Date().toISOString()};d.petitions.push(item);write(d);return send(res,201,{ok:true,item})}
if(req.url==='/api/whistle/queue'&&req.method==='POST'){const x=await body(req),d=read();d.whistle=d.whistle||[];const item={id:'WB-'+Date.now().toString(36).toUpperCase(),text:String(x.text||'').slice(0,10000),anonymous:true,time:new Date().toISOString()};d.whistle.push(item);write(d);return send(res,201,{ok:true,id:item.id,privacy:'No anonymity guarantee until a privacy-reviewed deployment is configured'});}
if(req.url==='/api/whistle/submit'&&req.method==='POST'){const x=await body(req),d=read();d.whistle=d.whistle||[];const item={id:'JS-'+Date.now().toString(36).toUpperCase(),text:String(x.text||'').slice(0,10000),anonymous:true,evidence:x.evidence||null,time:new Date().toISOString()};d.whistle.push(item);write(d);return send(res,201,{ok:true,id:item.id,privacy:'PRIVACY_FIRST_TARGET',stored:'complaint-and-evidence-fingerprint',note:'This local deployment does not claim guaranteed anonymity.'});}
function bnsSmartAnswer(q){
  const raw=String(q||'').trim();
  const s=raw.toLowerCase().replace(/[?؟]/g,' ');
  const hasBns=/\bbns\b|bharatiya nyaya sanhita|भारतीय न्याय संहिता|ipc|भारतीय दंड संहिता/.test(s);
  if(!hasBns) return null;

  if(/bns.*(?:चोरी|chori|theft)|(?:चोरी|chori|theft).*bns/.test(s)){
    return `**चोरी — BNS धारा 303**\n\nBNS की धारा 303 चोरी (theft) से संबंधित है। कौन-सी उपधारा और दंड लागू होगा, यह घटना के facts और लागू परिस्थितियों पर निर्भर करता है।\n\n**पुराना IPC संदर्भ:** IPC में theft से जुड़े प्रमुख प्रावधान 378/379 थे।\n\n⚠️ किसी वास्तविक मामले में अंतिम धारा केवल घटना का नाम देखकर तय नहीं की जानी चाहिए; वर्तमान official BNS text और facts verify करना जरूरी है।\n\n**Source:** Official India Code — Bharatiya Nyaya Sanhita, 2023.`;
  }
  if(/(?:मेरे मामले|मेरे केस|मेरी घटना|mere mamle|mere case|meri ghatna|my case|which section|kaunsi dhara|kaun si dhara|कौन.?सी धारा|कौनसी धारा|धारा.*लगेगी|section.*apply|लागू होगी|apply होगी)/.test(s)){
    return `आपकी घटना के facts के आधार पर BNS की **संभावित** धाराएँ identify की जा सकती हैं, लेकिन केवल एक छोटे description से अंतिम धारा तय करना सुरक्षित नहीं है।\n\nआप बिना नाम, फोन, पता या अन्य पहचान वाली जानकारी के बताइए: (1) क्या हुआ, (2) घटना कब हुई, (3) चोट/धमकी/संपत्ति का नुकसान हुआ या नहीं, (4) पैसा/संपत्ति/दस्तावेज/online transaction शामिल था या नहीं।\n\nफिर Pocket Rights संभावित BNS provisions और उनके कारण बताएगा; अंतिम निष्कर्ष के लिए current official text/qualified legal professional से verification जरूरी है।`;
  }

  // High-confidence BNS reference entries. These are deliberately concise and
  // should be verified against the current official India Code text for a live case.
  const entries=[
    {re:/\b103\b|murder|हत्या|murder ki dhara/, title:'हत्या (Murder)', sec:'103', old:'IPC 302', desc:'BNS में हत्या के लिए मुख्य दंड प्रावधान धारा 103 में है.'},
    {re:/\b109\b|attempt.*murder|हत्या.*प्रयास|जान से मारने की कोशिश/, title:'हत्या का प्रयास (Attempt to murder)', sec:'109', old:'IPC 307', desc:'हत्या के प्रयास से संबंधित प्रावधान BNS की धारा 109 में है.'},
    {re:/\b63\b|rape|बलात्कार/, title:'बलात्कार (Rape)', sec:'63', old:'IPC 375', desc:'बलात्कार की परिभाषा से संबंधित प्रावधान BNS की धारा 63 में है; दंड/विशेष परिस्थितियों के लिए संबंधित आगे की धाराएँ भी देखनी होती हैं.'},
    {re:/\b70\b|gang rape|सामूहिक बलात्कार|gangrape/, title:'सामूहिक बलात्कार (Gang rape)', sec:'70', old:'IPC 376D', desc:'सामूहिक बलात्कार से संबंधित दंड प्रावधान BNS की धारा 70 में है.'},
    {re:/\b80\b|dowry death|दहेज मृत्यु/, title:'दहेज मृत्यु (Dowry death)', sec:'80', old:'IPC 304B', desc:'दहेज मृत्यु से संबंधित प्रावधान BNS की धारा 80 में है.'},
    {re:/\b85\b|498a|cruelty.*married|विवाहित महिला.*क्रूरता|पति.*क्रूरता/, title:'पति/रिश्तेदार द्वारा क्रूरता', sec:'85', old:'IPC 498A', desc:'विवाहित महिला के प्रति पति या उसके रिश्तेदारों द्वारा क्रूरता से संबंधित दंड प्रावधान BNS की धारा 85 में है.'},
    {re:/\b303\b|theft|चोरी/, title:'चोरी (Theft)', sec:'303', old:'IPC 378/379', desc:'BNS की धारा 303 चोरी को परिभाषित करती है और उसके दंड का प्रावधान भी इसी धारा में है; उपधारा तथ्य के अनुसार महत्वपूर्ण हो सकती है.'},
    {re:/\b304\b|snatching|झपटमारी|स्नैचिंग/, title:'झपटमारी (Snatching)', sec:'304', old:'कोई सीधा समान IPC section नहीं', desc:'BNS की धारा 304 झपटमारी को अलग offence के रूप में संबोधित करती है.'},
    {re:/\b308\b|extortion|जबरन वसूली|उगाही/, title:'जबरन वसूली (Extortion)', sec:'308', old:'IPC 383 आदि', desc:'BNS में extortion से संबंधित प्रावधान धारा 308 में हैं.'},
    {re:/\b309\b|robbery|लूट/, title:'लूट (Robbery)', sec:'309', old:'IPC 390 आदि', desc:'BNS में robbery से संबंधित प्रावधान धारा 309 में हैं.'},
    {re:/\b310\b|dacoity|डकैती/, title:'डकैती (Dacoity)', sec:'310', old:'IPC 391 आदि', desc:'BNS में dacoity से संबंधित प्रावधान धारा 310 में हैं.'},
    {re:/\b314\b|criminal misappropriation|बेईमानी से संपत्ति का दुरुपयोग|आपराधिक गबन/, title:'Dishonest misappropriation of property', sec:'314', old:'IPC 403', desc:'चल संपत्ति के dishonest misappropriation से संबंधित प्रावधान BNS की धारा 314 में है.'},
    {re:/\b316\b|criminal breach of trust|आपराधिक न्यासभंग|विश्वासघात.*संपत्ति/, title:'Criminal breach of trust', sec:'316', old:'IPC 405/406 आदि', desc:'Criminal breach of trust से संबंधित मुख्य प्रावधान BNS की धारा 316 में हैं; उपधारा facts पर निर्भर करती है.'},
    {re:/\b317\b|stolen property|चोरी की संपत्ति|stolen goods/, title:'Stolen property', sec:'317', old:'IPC 410/411 आदि', desc:'चोरी की संपत्ति को प्राप्त/रखने आदि से संबंधित प्रावधान BNS की धारा 317 में हैं.'},
    {re:/\b318\b|cheating|धोखाधड़ी|ठगी|420/, title:'Cheating', sec:'318', old:'IPC 415/417/420', desc:'BNS की धारा 318 cheating से संबंधित है। अलग परिस्थितियों में इसकी अलग उपधाराएँ लागू हो सकती हैं.'},
    {re:/\b319\b|personation|प्रतिरूपण|किसी और बनकर धोखा/, title:'Cheating by personation', sec:'319', old:'IPC 416/419', desc:'किसी दूसरे व्यक्ति का प्रतिरूपण करके cheating से संबंधित प्रावधान BNS की धारा 319 में है.'},
    {re:/\b329\b|criminal trespass|house trespass|आपराधिक अतिचार|घर में घुसना/, title:'Criminal trespass / house-trespass', sec:'329', old:'IPC 441/447 आदि', desc:'Criminal trespass और house-trespass की शुरुआत BNS की धारा 329 में है; आगे की परिस्थितियों के लिए संबंधित धाराएँ देखनी होती हैं.'}
  ];

  // Comparison questions first, so a phrase like “BNS और IPC में क्या अंतर है?”
  // cannot be mistaken for a generic “what is BNS?” question.
  if(/bns.*ipc|ipc.*bns|अंतर|difference|compare|तुलना/.test(s)){
    return `**BNS और IPC का तथ्यात्मक अंतर:**\n\n• **BNS:** Bharatiya Nyaya Sanhita, 2023 — भारत का वर्तमान principal substantive criminal law framework.\n• **IPC:** Indian Penal Code, 1860 — पुराना principal penal code, जिसे BNS ने repeal किया.\n• कई offences की numbering/wording बदली है; उदाहरण के लिए theft **BNS 303**, cheating **BNS 318**, और murder का मुख्य दंड प्रावधान **BNS 103** है.\n• किसी पुराने IPC case या घटना में केवल section number देखकर BNS section लागू मानना सही नहीं; घटना की तारीख, transitional provisions और facts देखना जरूरी है.\n\n**Source:** Official India Code — BNS, 2023.`;
  }

  // Definition / identity questions.
  if(/^(?:what is|meaning of|define|क्या है|मतलब|का मतलब|kya hai|ka matlab|full form)\b/.test(s) || /bns.*(?:क्या|मतलब|meaning|full form|kya|matlab)|(?:क्या|मतलब|meaning|kya|matlab).*bns/.test(s)){
    return `**BNS** का पूरा नाम **Bharatiya Nyaya Sanhita, 2023 (भारतीय न्याय संहिता, 2023)** है। यह offences और उनसे जुड़े दंड से संबंधित प्रमुख criminal law है। India Code में यह **Act No. 45 of 2023** के रूप में दर्ज है। BNS ने IPC, 1860 को repeal किया; लेकिन किसी घटना में कौन-सा कानून/प्रावधान लागू होगा, यह घटना की तारीख और facts पर निर्भर कर सकता है।\n\n**Source:** Official India Code — BNS, 2023.`;
  }

  for(const e of entries){
    if(e.re.test(s)){
      return `**${e.title} — BNS धारा ${e.sec}**\n\n${e.desc}\n\n**पुराने IPC में संदर्भ:** ${e.old}.\n\n⚠️ केवल घटना का नाम देखकर किसी व्यक्ति के मामले में अंतिम धारा तय नहीं की जा सकती। Facts, तारीख, लागू उपधारा और अन्य संबंधित कानून देखना जरूरी है।\n\n**Source:** Official India Code / current BNS text.`;
    }
  }

  // Case-facts questions: do not pretend to select a final section from a short prompt.
  if(/मेरे मामले|मेरे केस|मेरी घटना|my case|which section|कौन.?सी धारा|कौनसी धारा|धारा.*लगेगी|section.*apply|लागू होगी|apply होगी/.test(s)){
    return `आपकी घटना के facts के आधार पर BNS की संभावित धाराएँ identify की जा सकती हैं, लेकिन केवल एक छोटे description से अंतिम धारा तय करना सुरक्षित नहीं है।\n\nआप **बिना नाम, फोन, पता या अन्य पहचान वाली जानकारी** के ये बातें बताइए:\n1. क्या हुआ?\n2. घटना कब हुई?\n3. क्या कोई चोट/धमकी/संपत्ति का नुकसान हुआ?\n4. क्या कोई पैसा/संपत्ति/दस्तावेज/online transaction शामिल था?\n5. कोई उपलब्ध document/evidence किस प्रकार का है?\n\nफिर Pocket Rights संभावित BNS provisions को **“संभावित”** के रूप में बताएगा और official current text से verification की जरूरत स्पष्ट करेगा।`;
  }
  return null;
}

function smartOtherLawAnswer(q){
  const raw=String(q||'').trim();
  const s=raw.toLowerCase().replace(/[?؟]/g,' ');

  // BNSS — procedure
  if(/\bbnss\b|bharatiya nagarik suraksha sanhita|भारतीय नागरिक सुरक्षा संहिता|\bcrpc\b|दंड प्रक्रिया/.test(s)){
    if(/bnss.*(?:crpc|ipc)|crpc.*bnss|bnss.*अंतर|bnss.*difference|तुलना/.test(s)){
      return `**BNSS और CrPC का तथ्यात्मक अंतर:**\n\n• **BNSS:** Bharatiya Nagarik Suraksha Sanhita, 2023 — criminal procedure से संबंधित वर्तमान प्रमुख संहिता।\n• **CrPC:** Code of Criminal Procedure, 1973 — पुरानी criminal-procedure code, जिसे BNSS ने repeal किया।\n• FIR, investigation, arrest, bail, trial और अन्य procedural matters में BNSS के वर्तमान provisions देखे जाते हैं।\n• पुराने मामले में केवल नया section number देखकर BNSS provision लागू नहीं मानना चाहिए; घटना/कार्यवाही की तारीख और transitional provisions देखना जरूरी है।\n\n**Source:** Official India Code.`;
    }
    if(/fir|एफआईआर|first information|शिकायत/.test(s)){
      return `**BNSS और FIR:**\n\nFIR से संबंधित criminal-procedure नियम BNSS में देखे जाते हैं। किसी specific घटना में कौन-सा procedural provision लागू होगा, यह facts, offence की प्रकृति और घटना/कार्यवाही की तारीख पर निर्भर करता है।\n\n**ध्यान दें:** केवल FIR की धाराएँ देखकर किसी मामले का अंतिम कानूनी निष्कर्ष नहीं निकाला जा सकता। Current official BNSS text verify करें।\n\n**Source:** Official India Code.`;
    }
    if(/arrest|गिरफ्तार|हिरासत|custody|bail|जमानत|investigation|जांच|search|तलाशी|seizure|जब्ती/.test(s)){
      return `**BNSS — criminal procedure:**\n\nयह गिरफ्तारी, जांच, जमानत, तलाशी/जब्ती, FIR और trial जैसी criminal-procedure प्रक्रियाओं से संबंधित प्रमुख संहिता है। Exact section facts और वर्तमान official text देखकर ही तय किया जाना चाहिए।\n\n**Source:** Official India Code.`;
    }
    return `**BNSS** का पूरा नाम **Bharatiya Nagarik Suraksha Sanhita, 2023 (भारतीय नागरिक सुरक्षा संहिता, 2023)** है। यह criminal procedure से संबंधित प्रमुख भारतीय संहिता है। FIR, गिरफ्तारी, जांच, जमानत और trial जैसी प्रक्रियाओं में इसके provisions देखे जाते हैं।\n\n**Source:** Official India Code.`;
  }

  // BSA — evidence
  if(/\bbsa\b|bharatiya sakshya adhiniyam|भारतीय साक्ष्य अधिनियम|\bindian evidence act\b|evidence|साक्ष्य|सबूत/.test(s)){
    if(/bsa.*(?:evidence act|indian evidence)|evidence.*bsa|bsa.*अंतर|bsa.*difference|तुलना/.test(s)){
      return `**BSA और पुराने Indian Evidence Act का तथ्यात्मक अंतर:**\n\n• **BSA:** Bharatiya Sakshya Adhiniyam, 2023 — evidence law का वर्तमान प्रमुख framework।\n• **Indian Evidence Act, 1872:** पुराना evidence statute, जिसे BSA ने repeal किया।\n• Documents, electronic/digital records और अन्य evidence के proof/admissibility से जुड़े नियम BSA के current text में देखे जाते हैं।\n• किसी पुराने proceeding में केवल नए section number से निष्कर्ष नहीं निकालना चाहिए; applicable date/transitional provisions देखना जरूरी है।\n\n**Source:** Official India Code.`;
    }
    if(/electronic|digital|मोबाइल|whatsapp|chat|ईमेल|email|सीसीटीवी|cctv|audio|video|फोटो|photo/.test(s)){
      return `**BSA और electronic evidence:**\n\nElectronic/digital records के evidence rules BSA के current framework में देखे जाते हैं। किसी specific file, phone, chat, CCTV या recording की admissibility/proof facts, source, integrity और लागू provisions पर निर्भर करती है।\n\nइसलिए केवल “यह digital है” कहने से यह तय नहीं किया जा सकता कि court में वह अपने-आप पर्याप्त proof होगा। Current official BSA text और relevant judicial interpretation verify करें।\n\n**Source:** Official India Code.`;
    }
    return `**BSA** का पूरा नाम **Bharatiya Sakshya Adhiniyam, 2023 (भारतीय साक्ष्य अधिनियम, 2023)** है। यह evidence से संबंधित प्रमुख भारतीय कानून है और documents तथा electronic/digital records सहित evidence के rules से संबंधित है।\n\n**Source:** Official India Code.`;
  }
  return null;
}

function constitutionalArticleAnswer(q){
  const m=q.match(/(?:अनुच्छेद|article|art\.?)[\s:-]*(\d{1,3})([a-z]{1,3})?/i);
  if(!m)return null;
  const n=m[1]+(m[2]?m[2].toUpperCase():'');
  const title=CONSTITUTION_KB.key_articles?.[n];
  const num=parseInt(m[1],10);
  let part=null;
  for(const row of (CONSTITUTION_KB.parts||[])){
    const r=String(row[2]);
    const nums=[...r.matchAll(/\d+/g)].map(x=>parseInt(x[0],10));
    if(nums.length>=2 && num>=nums[0] && num<=nums[nums.length-1]){part=row;break;}
    if(nums.length===1 && num===nums[0]){part=row;break;}
  }
  if(!title && !part)return null;
  return `📜 अनुच्छेद ${n}\n\n${title?`विषय: ${title}`:'इस अनुच्छेद का विषय इस स्थानीय संरचनात्मक सूचकांक में उपलब्ध नहीं है।'}\n${part?`भाग: ${part[0]} — ${part[1]}\nअनुच्छेद सीमा: ${part[2]}`:''}\n\nयह उत्तर संविधान के संरचनात्मक संदर्भ के आधार पर है। पूरे उपबंध/क्लॉज़ का अर्थ निकालने के लिए आधिकारिक संविधान-पाठ और, जहाँ जरूरी हो, संबंधित न्यायिक व्याख्या देखना चाहिए। यह सामान्य जानकारी है, व्यक्तिगत कानूनी सलाह नहीं।`;
}
function constitutionalSearch(q){
  const s=String(q||'').toLowerCase().trim();
  const hits=[];
  for(const [n,title] of Object.entries(CONSTITUTION_KB.key_articles||{})){
    if(String(title).toLowerCase().includes(s) || s.includes(String(title).toLowerCase())) hits.push({article:n,title});
  }
  for(const row of (CONSTITUTION_KB.parts||[])){
    if(row.join(' ').toLowerCase().includes(s)) hits.push({part:row[0],title:row[1],range:row[2]});
  }
  return hits.slice(0,12);
}
function constitutionalSearchAnswer(q){
  const s=String(q||'').toLowerCase();
  if(!/(खोज|ढूंढ|find|search|किस.*अनुच्छेद|कौन.*अनुच्छेद)/.test(s)) return null;
  const cleaned=s.replace(/(खोजो|खोजें|ढूंढो|ढूंढें|find|search|किस.*?अनुच्छेद|कौन.*?अनुच्छेद)/g,' ').trim();
  const hits=constitutionalSearch(cleaned);
  if(!hits.length) return null;
  return '🔎 संविधान संदर्भ खोज\n\n'+hits.map((h,i)=>h.article?`${i+1}. अनुच्छेद ${h.article} — ${h.title}`:`${i+1}. ${h.part} — ${h.title} (${h.range})`).join('\n')+'\n\nयह local reference index है; authoritative text के लिए आधिकारिक संविधान देखें।';
}
function constitutionalFallback(q){
  const article=constitutionalArticleAnswer(q); if(article)return article;
  const searchAnswer=constitutionalSearchAnswer(q); if(searchAnswer)return searchAnswer;
  const s=q.toLowerCase();
  if(/कितने.*अनुच्छेद|how many.*articles|articles.*constitution/.test(s)) return `वर्तमान संविधान की संरचना में अनुच्छेद क्रमांकन 1 से 395 तक है; संशोधनों से 21A, 243A आदि जैसे lettered Articles भी जोड़े गए हैं। संविधान 25 Parts के रूप में व्यवस्थित है और 12 Schedules हैं। कुछ मूल Part/Articles repealed/omitted भी हैं।`;
  if(/कितने.*भाग|how many.*parts/.test(s)) return `संविधान की वर्तमान संरचना 25 Parts में व्यवस्थित मानी जाती है। Part VII का Article 238 repealed है, जबकि IVA, IXA, IXB और XIVA जैसे inserted Parts भी हैं।`;
  if(/कितनी.*अनुसूच|how many.*schedule/.test(s)) return `संविधान में 12 Schedules हैं। इनमें राज्यों/केंद्रशासित प्रदेशों, संवैधानिक पदों, शपथ, राज्यसभा सीटों, अनुसूचित/जनजातीय क्षेत्रों, विधायी सूचियों, भाषाओं, anti-defection, पंचायत और नगरपालिका विषयों जैसी सामग्री शामिल है।`;
  if(/अनुसूची|schedule/.test(s)) return 'संविधान में 12 Schedules हैं। स्थानीय reference index में प्रत्येक Schedule का विषय और उससे जुड़े प्रमुख Articles उपलब्ध हैं।';
  if(/संविधान क्या|constitution kya|what is constitution/.test(s)) return `भारत का संविधान देश का सर्वोच्च संवैधानिक ढांचा है। यह शासन की संस्थाओं, शक्तियों, नागरिकों के अधिकारों और राज्य के मार्गदर्शक सिद्धांतों की व्यवस्था करता है।\n\n• मौलिक अधिकार: भाग III\n• राज्य के नीति-निर्देशक तत्व: भाग IV\n• मौलिक कर्तव्य: अनुच्छेद 51A\n• संवैधानिक उपचार: अनुच्छेद 32 और उच्च न्यायालयों की writ jurisdiction के लिए अनुच्छेद 226\n\nयह सामान्य संवैधानिक जानकारी है; किसी वास्तविक मामले में लागू कानून/न्यायिक निर्णय की पुष्टि करें।`;
  if(/बराबरी|समानता|equal|discrimination|भेदभाव/.test(s)) return `अनुच्छेद 14 कानून के समक्ष समानता और कानून के समान संरक्षण का आधार देता है। अनुच्छेद 15 कुछ आधारों पर भेदभाव पर रोक और अनुच्छेद 16 सार्वजनिक रोजगार में समान अवसर से संबंधित है।\n\n• सामान्य उपाय: संबंधित सरकारी निर्णय/आदेश की प्रति सुरक्षित रखें।\n• मामले के अनुसार सक्षम प्राधिकरण/न्यायालय में उचित remedy देखी जाती है।`;
  if(/बोलने|अभिव्यक्ति|speech|expression|प्रेस|लिखने/.test(s)) return `अनुच्छेद 19(1)(a) नागरिकों को वाक् और अभिव्यक्ति की स्वतंत्रता देता है। यह अधिकार अनुच्छेद 19(2) में बताए गए संवैधानिक आधारों पर कानून द्वारा लगाए गए प्रतिबंधों के अधीन है।`;
  if(/जीवन|निजता|privacy|life|liberty|स्वतंत्रता/.test(s)) return `अनुच्छेद 21 जीवन और व्यक्तिगत स्वतंत्रता से संबंधित मौलिक संरक्षण देता है। इसके दायरे को सर्वोच्च न्यायालय ने विभिन्न निर्णयों में विकसित किया है। वास्तविक मामले में facts, लागू कानून और relevant case law देखना जरूरी है।`;
  if(/गिरफ्तार|arrest|हिरासत|custody/.test(s)) return `गिरफ्तारी/हिरासत में अनुच्छेद 22 महत्वपूर्ण संवैधानिक safeguards देता है। सामान्य रूप से गिरफ्तार व्यक्ति को गिरफ्तारी के कारण बताए जाने और वकील से परामर्श/बचाव जैसे अधिकार मिलते हैं, subject to constitutional exceptions and applicable criminal procedure. BNS/BNSS और अन्य लागू कानून भी देखे जाने चाहिए।`;
  if(/धर्म|religion|पूजा|मजहब/.test(s)) return `धर्म की स्वतंत्रता से जुड़े प्रमुख संवैधानिक प्रावधान अनुच्छेद 25 से 28 में हैं। ये अधिकार संविधान में निर्धारित सीमाओं और सार्वजनिक व्यवस्था, नैतिकता तथा स्वास्थ्य जैसे आधारों के अधीन हैं।`;
  if(/शिक्षा|education|स्कूल|school/.test(s)) return `अनुच्छेद 21A 6 से 14 वर्ष के बच्चों के लिए निःशुल्क और अनिवार्य शिक्षा से संबंधित है। शिक्षा से जुड़े अन्य अधिकार और योजनाएँ अलग कानूनों/नीतियों में भी हो सकती हैं।`;
  if(/सुप्रीम कोर्ट|supreme court|अनुच्छेद 32|article 32|writ/.test(s)) return `अनुच्छेद 32 मौलिक अधिकारों के प्रवर्तन के लिए सर्वोच्च न्यायालय जाने का संवैधानिक अधिकार देता है। उच्च न्यायालयों की writ jurisdiction अनुच्छेद 226 में है। कौन-सी writ/remedy उचित है, यह मामले के facts और उपलब्ध remedies पर निर्भर करता है।`;
  if(/मौलिक अधिकार|fundamental rights/.test(s)) return `मौलिक अधिकार संविधान के भाग III (अनुच्छेद 12 से 35) में हैं। इनमें समानता, स्वतंत्रता, शोषण के विरुद्ध अधिकार, धार्मिक स्वतंत्रता, सांस्कृतिक/शैक्षिक अधिकार और संवैधानिक उपचार शामिल हैं।`;
  if(/मौलिक कर्तव्य|fundamental duties|51a|51ए/.test(s)) return `मौलिक कर्तव्य अनुच्छेद 51A में हैं। ये नागरिकों के संवैधानिक कर्तव्यों का उल्लेख करते हैं। इन्हें मौलिक अधिकारों की तरह उसी तरीके से सीधे enforceable समझना सही नहीं है; संबंधित कानून और न्यायिक व्याख्या देखनी होती है।`;
  if(/नीति निर्देशक|directive principles|राज्य के नीति/.test(s)) return `राज्य के नीति-निर्देशक तत्व भाग IV (अनुच्छेद 36 से 51) में हैं। अनुच्छेद 37 के अनुसार ये न्यायालय द्वारा सीधे enforceable नहीं हैं, लेकिन शासन में fundamental माने गए हैं।`;
  if(/अनुसूच|schedule/.test(s)) return `संविधान में 12 Schedules हैं। उदाहरण के लिए 7वीं अनुसूची Union, State और Concurrent Lists देती है; 8वीं अनुसूची भाषाओं से संबंधित है; 10वीं अनुसूची defection से संबंधित है; 11वीं और 12वीं क्रमशः Panchayats और Municipalities के विषयों से जुड़ी हैं।`;
  if(/bns|भारतीय न्याय संहिता|ipc/.test(s)) return `BNS यानी Bharatiya Nyaya Sanhita, 2023 ने भारतीय दंड संहिता (IPC) की जगह नया substantive criminal law framework दिया है। किसी घटना पर कौन-सी धारा लागू होगी, यह घटना के facts और लागू तारीख पर निर्भर करता है। सटीक धारा बताने से पहले आधिकारिक वर्तमान कानून/India Code text देखना जरूरी है।`;
  if(/bnss|भारतीय नागरिक सुरक्षा संहिता|crpc|गिरफ्तारी.*कानून|fir.*दर्ज/.test(s)) return `BNSS यानी Bharatiya Nagarik Suraksha Sanhita, 2023 criminal procedure से संबंधित प्रमुख कानून है। FIR, गिरफ्तारी, जांच, जमानत और trial की प्रक्रिया में इसका महत्व है। किसी specific मामले में लागू प्रावधान facts और वर्तमान official text देखकर तय किए जाने चाहिए।`;
  if(/bsa|भारतीय साक्ष्य अधिनियम|evidence|सबूत|साक्ष्य/.test(s)) return `BSA यानी Bharatiya Sakshya Adhiniyam, 2023 evidence law से संबंधित है। दस्तावेज, electronic records और अन्य evidence की admissibility/proof के नियम इसी framework में देखे जाते हैं। specific evidence question में वर्तमान official text और न्यायिक interpretation की पुष्टि करें।`;
  if(/fir|एफआईआर/.test(s)) return `FIR किसी cognizable offence की सूचना दर्ज करने की criminal-procedure प्रक्रिया से जुड़ी है। घटना, थाना/क्षेत्राधिकार और लागू प्रक्रिया के आधार पर अगला कदम अलग हो सकता है। FIR से जुड़े constitutional protections और BNSS provisions दोनों देखे जा सकते हैं। यह सामान्य जानकारी है, व्यक्तिगत कानूनी सलाह नहीं।`;
  if(/तलाशी|search|जप्त|seizure/.test(s)) return `तलाशी और जब्ती में संविधान के Article 21 सहित लागू criminal-procedure safeguards महत्वपूर्ण हो सकते हैं। किसी specific search की legality facts, warrant/exception और लागू procedural provisions पर निर्भर करती है; इसलिए exact मामले में official law text देखना जरूरी है।`;
  if(/महिला|महिला सुरक्षा|women|छेड़|बलात्कार|harassment/.test(s)) return `महिलाओं की सुरक्षा में संविधान के समानता और जीवन/व्यक्तिगत स्वतंत्रता संबंधी protections के साथ लागू criminal laws और special protective laws भी महत्वपूर्ण हो सकते हैं। specific घटना में exact offence और remedy facts पर निर्भर करेंगे। आप बिना नाम-पता बताए केवल घटना का सामान्य प्रकार पूछ सकते हैं।`;
  if(/रिश्वत|भ्रष्टाचार|bribe|corruption/.test(s)) return `रिश्वत/भ्रष्टाचार के मामलों में facts के अनुसार Prevention of Corruption Act और संबंधित criminal/procedural provisions लागू हो सकते हैं। शिकायत के लिए संबंधित competent anti-corruption authority या official complaint channel देखा जाना चाहिए। exact section facts और current law text से verify करें।`;
  if(/ट्रैफिक|traffic|चालान|challan|ड्राइविंग|license/.test(s)) return `Traffic मामलों में Motor Vehicles Act और संबंधित rules/notifications महत्वपूर्ण होते हैं। चालान, licence, vehicle seizure या accident जैसे मामलों में exact remedy facts और वर्तमान नियमों पर निर्भर करती है।`;
  return `मैं अभी **Local Constitution & Law Reference Mode** में हूँ। इस version में Groq API key के बिना भी संविधान और कुछ प्रमुख भारतीय कानूनों से जुड़े सामान्य सवालों का जवाब दिया जा सकता है।

आप अपना सवाल थोड़ा स्पष्ट लिखें, जैसे:
• “BNS क्या है?”
• “Article 21 क्या कहता है?”
• “FIR कैसे दर्ज होती है?”
• “Article 32 में remedy क्या है?”
• “तलाशी में नागरिक के संवैधानिक अधिकार क्या हैं?”

नए कानून/संशोधन के लिए app official-source update catalog को भी check करता है। Exact legal advice के लिए वर्तमान official text और qualified legal professional से verification जरूरी है।`;
}
if(req.url==='/api/law-updates'&&req.method==='GET'){const db=readLawDb();return send(res,200,{ok:true,lastChecked:db.lastChecked,sources:db.sources,acts:(db.acts||[]).slice(0,100),errors:db.errors||[],policy:db.updatePolicy||'Automatic official-source check.'});}
if(req.url==='/api/law-updates/check'&&req.method==='POST'){const db=await syncOfficialLawCatalog(true);return send(res,200,{ok:true,lastChecked:db.lastChecked,acts:(db.acts||[]).slice(0,100),errors:db.errors||[]});}
if(req.url==='/api/constitution-index'&&req.method==='GET')return send(res,200,{ok:true,source:CONSTITUTION_KB.source,sourceNote:CONSTITUTION_KB.source_note,parts:CONSTITUTION_KB.parts,schedules:CONSTITUTION_KB.schedules,keyArticleCount:Object.keys(CONSTITUTION_KB.key_articles||{}).length,keyArticles:CONSTITUTION_KB.key_articles});
if(req.url==='/api/pocket-rights'&&req.method==='POST'){
  const x=await body(req),q=String(x.question||'').trim().slice(0,1200);
  if(!q)return send(res,400,{ok:false,error:'question required'});
  // Route legal intent before AI: identity, section lookup, IPC/BNS comparison,
  // and fact-pattern questions get a deterministic law-aware response first.
  const bnsAnswer=bnsSmartAnswer(q);
  if(bnsAnswer) return send(res,200,{ok:true,answer:bnsAnswer,source:'BNS structured law reference'});
  const otherLawAnswer=smartOtherLawAnswer(q);
  if(otherLawAnswer) return send(res,200,{ok:true,answer:otherLawAnswer,source:'BNSS/BSA structured law reference'});
  const fallback=constitutionalFallback(q);
  if(fallback) return send(res,200,{ok:true,answer:fallback,source:'Built-in Constitution & Law Reference'});
  if(!process.env.GROQ_API_KEY){
    return send(res,200,{ok:true,answer:'इस सवाल के लिए अभी Local legal reference में तैयार उत्तर नहीं मिला। आप सवाल थोड़ा स्पष्ट लिखें; Groq API उपलब्ध होने पर AI से विस्तृत उत्तर लिया जाएगा।',source:'Local reference fallback'});
  }
  try{
    const r=await groqChat([
      {role:'system',content:`You are Vajra Nyay Pocket Rights — a Constitution-first and current-law Indian citizen rights assistant. Use the Constitution of India as the primary constitutional source, including the Preamble, Parts I-XXII, Schedules, and Articles. For constitutional questions, identify the relevant Article/Part when you are confident, explain the right or constitutional principle in very simple Hindi/Hinglish, and then explain the likely constitutional remedy or next lawful step. Cover Fundamental Rights (Part III, Arts 12-35), Directive Principles (Part IV, Arts 36-51), Fundamental Duties (Art 51A), constitutional remedies (Arts 32 and 226), and other relevant constitutional provisions. Do not invent an Article number, court case, or remedy. Distinguish enforceable Fundamental Rights from Directive Principles and general policy. If a question also depends on ordinary statutes/procedure, clearly say so and name the relevant law only when confident. Do not claim that every dispute is a constitutional violation. Never ask for name, phone, email, address or identifying information. This is general information, not personal legal advice. For BNS/BNSS/BSA and other statutes, distinguish the law's name, section number, ingredients, exceptions and procedure; never guess a section. If the question asks which section applies to facts, first summarize the facts, list only plausible provisions with reasons, and label them as potential rather than final. Prefer official India Code/current government text as the authority and tell the user to verify the current official text for a live case.`},
      {role:'user',content:q+'\n\nOfficial-law catalog context (use only as a lead; do not invent text):\n'+(relevantLawContext(q)||'No matching official catalog entry was found locally.')}
    ],650);
    const ans=r?.data?.choices?.[0]?.message?.content;
    if(ans)return send(res,200,{ok:true,answer:ans,source:'Constitution-first Groq backend'});
    return send(res,200,{ok:true,answer:'AI backend ने उत्तर नहीं दिया। इस सवाल के लिए Local legal reference में भी तैयार उत्तर उपलब्ध नहीं है।',source:'Local reference fallback',aiError:r?.data?.error?.message||'Groq returned no answer'});
  }catch(e){
    return send(res,200,{ok:true,answer:'AI backend से उत्तर नहीं मिला। कृपया थोड़ी देर बाद फिर कोशिश करें या सवाल को थोड़ा स्पष्ट लिखें।',source:'Local reference fallback'});
  }
}
if(req.url.startsWith('/api/complaints')&&req.method==='GET'){const d=read(),q=new URL(req.url,'http://localhost').searchParams.get('q')?.toLowerCase()||'';return send(res,200,(d.complaints||[]).filter(x=>!q||String(x.id).toLowerCase().includes(q)||String(x.category||'').toLowerCase().includes(q)))}
if(req.url==='/api/complaints'&&req.method==='POST'){const x=await body(req),d=read();d.complaints=d.complaints||[];const i=d.complaints.findIndex(v=>v.id===x.id);if(i>=0)d.complaints[i]={...d.complaints[i],...x};else d.complaints.push(x);write(d);return send(res,201,{ok:true,complaint:x})}
if(req.url.startsWith('/api/complaints/')&&req.method==='GET'){const id=decodeURIComponent(req.url.split('/').pop()),x=(read().complaints||[]).find(v=>v.id===id);return x?send(res,200,x):send(res,404,{ok:false,error:'Case not found'})}
if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html')){
  // Render may run this file from /backend, where the frontend index.html is one level above.
  const candidates=[path.join(__dirname,'index.html'),path.join(__dirname,'..','index.html')];
  const htmlFile=candidates.find(f=>fs.existsSync(f));
  if(!htmlFile){return send(res,200,{ok:true,service:'VAJRA NYAY BACKEND',message:'Backend is running. Frontend is hosted separately on GitHub Pages.'});}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  const stream=fs.createReadStream(htmlFile);
  stream.on('error',()=>{if(!res.headersSent)send(res,500,{ok:false,error:'Frontend file could not be read'});else res.destroy();});
  return stream.pipe(res);
}
send(res,404,{ok:false,error:'Not found'})}catch(e){send(res,500,{ok:false,error:e.message})}});
scheduleLawSync();
server.listen(PORT,()=>console.log(`VAJRA NYAY: http://localhost:${PORT}`));
