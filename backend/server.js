const express=require('express');
const cors=require('cors');
const fs=require('fs');
const path=require('path');
require('dotenv').config();
const app=express();
const PORT=process.env.PORT||3000;
const DATA=path.join(__dirname,'data');
const LAWYERS=path.join(DATA,'lawyers.json');
const FILE=path.join(DATA,'complaints.json');
fs.mkdirSync(DATA,{recursive:true});
if(!fs.existsSync(FILE)) fs.writeFileSync(FILE,'[]');
if(!fs.existsSync(LAWYERS)) fs.writeFileSync(LAWYERS,'[]');
app.use(cors());
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname,'public')));
const read=()=>JSON.parse(fs.readFileSync(FILE,'utf8')||'[]');
const write=x=>fs.writeFileSync(FILE,JSON.stringify(x,null,2));
const readLawyers=()=>JSON.parse(fs.readFileSync(LAWYERS,'utf8')||'[]');
const writeLawyers=x=>fs.writeFileSync(LAWYERS,JSON.stringify(x,null,2));
const clean=s=>String(s??'').trim().slice(0,5000);
app.get('/api/health',(req,res)=>res.json({ok:true,service:'Vajra Nyay Backend',governmentApi:process.env.GOV_API_ENABLED==='true'}));
app.get('/api/complaints',(req,res)=>{
  const list=read().map(({privateData,...x})=>x);
  res.json({ok:true,complaints:list});
});
app.post('/api/complaints/submit',async(req,res)=>{
  const b=req.body||{};
  if(!clean(b.text)) return res.status(400).json({ok:false,error:'शिकायत का विवरण आवश्यक है।'});
  const id='VN-'+Date.now().toString(36).toUpperCase();
  const record={id,category:clean(b.category)||'OTHER',text:clean(b.text),place:clean(b.place),policeStation:clean(b.policeStation),time:new Date().toISOString(),status:'Pending verification',source:'Vajra Nyay'};
  const all=read(); all.push(record); write(all);
  // Government submission is intentionally disabled until an official authorized API is configured.
  res.status(201).json({ok:true,complaint:record,government:{submitted:false,reason:'Official government API not configured'}});
});
app.get('/api/complaints/status/:id',(req,res)=>{
  const x=read().find(v=>v.id===req.params.id);
  if(!x) return res.status(404).json({ok:false,error:'Case not found'});
  res.json({ok:true,id:x.id,status:x.status,time:x.time});
});
app.patch('/api/complaints/status/:id',(req,res)=>{
  const allowed=['Pending verification','Under review','Verified','Closed'];
  if(!allowed.includes(req.body?.status)) return res.status(400).json({ok:false,error:'Invalid status'});
  const all=read(); const x=all.find(v=>v.id===req.params.id);
  if(!x) return res.status(404).json({ok:false,error:'Case not found'});
  x.status=req.body.status; x.updatedAt=new Date().toISOString(); write(all); res.json({ok:true,complaint:x});
});

app.get('/api/lawyers',(req,res)=>{
  const list=readLawyers().filter(x=>x.public===true).map(({phone,...x})=>x);
  res.json({ok:true,lawyers:list});
});
app.post('/api/lawyers/register',(req,res)=>{
  const b=req.body||{};
  const name=clean(b.name), city=clean(b.city), phone=clean(b.phone);
  if(!name||!city||!phone) return res.status(400).json({ok:false,error:'नाम, शहर और संपर्क नंबर आवश्यक है।'});
  const all=readLawyers();
  const privateCount=all.filter(x=>x.type==='private').length;
  const fee=privateCount<5?0:100;
  const record={id:'LAW-'+Date.now().toString(36).toUpperCase(),name,city,specialization:clean(b.specialization),experience:clean(b.experience),phone,type:b.type==='legal_aid'?'legal_aid':'private',fee,status:'Verification pending',verified:false,public:false,createdAt:new Date().toISOString()};
  all.push(record);writeLawyers(all);
  res.status(201).json({ok:true,registrationId:record.id,fee,status:record.status});
});

app.get('/api/map',(req,res)=>{
  const all=read();
  const grouped={};
  for(const x of all){
    if(!x.place) continue;
    const k=x.place.toLowerCase();
    if(!grouped[k]) grouped[k]={place:x.place,total:0,briberyComplaints:0,verified:0};
    grouped[k].total++;
    if(/brib|रिश्वत|घूस|corrupt|भ्रष्टाचार/i.test(x.category+' '+x.text)) grouped[k].briberyComplaints++;
    if(x.status==='Verified') grouped[k].verified++;
  }
  res.json({ok:true,locations:Object.values(grouped)});
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`VAJRA NYAY BACKEND: http://localhost:${PORT}`));
