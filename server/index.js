import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { readJson, writeJson } from './storage.js';
import { fetchAircraft } from './providers/fr24Web.js';
import { getOsm } from './overpass.js';
import { TrackManager } from './tracks.js';
import { distanceM } from './geo.js';

const defaults={center:{lat:55.623087,lon:37.360494},radiusM:3500,heightScale:1,historyTracks:30,pollMs:Number(process.env.FR24_POLL_MS)||5000};
let settings={...defaults,...await readJson('settings.json',{})};
const tracks=new TrackManager(); await tracks.init();
let latest=[], feedError=null, feedUpdatedAt=null, feedSourceTimestamp=null;

const app=express(); app.use(express.json());
app.get('/api/settings',(req,res)=>res.json(settings));
app.put('/api/settings',async(req,res)=>{
  const b=req.body||{};
  settings={...settings,
    center:{lat:Number(b.center?.lat??settings.center.lat),lon:Number(b.center?.lon??settings.center.lon)},
    radiusM:Math.max(250,Math.min(30000,Number(b.radiusM??settings.radiusM))),
    heightScale:Math.max(.05,Math.min(10,Number(b.heightScale??settings.heightScale))),
    historyTracks:Math.max(1,Math.min(500,Number(b.historyTracks??settings.historyTracks)))
  };
  await writeJson('settings.json',settings); res.json(settings);
});
app.get('/api/osm', async(req,res)=>{try{res.json(await getOsm(settings));}catch(e){res.status(502).json({error:String(e.message||e)})}});
app.get('/api/state',(req,res)=>res.json({aircraft:latest,tracks:tracks.snapshot(),feedError,feedUpdatedAt,feedSourceTimestamp}));

const dist=path.resolve('dist');
app.use(express.static(dist));
app.use((req,res,next)=>{ if(req.method==='GET' && !req.path.startsWith('/api/') && req.path!=='/ws') return res.sendFile(path.join(dist,'index.html')); next(); });
const server=http.createServer(app); const wss=new WebSocketServer({server,path:'/ws'});
function broadcast(o){const s=JSON.stringify(o);for(const ws of wss.clients)if(ws.readyState===1)ws.send(s)}
wss.on('connection',ws=>ws.send(JSON.stringify({type:'state',settings,aircraft:latest,tracks:tracks.snapshot(),feedError,feedUpdatedAt,feedSourceTimestamp})));

async function poll(){
  try{
    const all=await fetchAircraft(settings);
    latest=all.filter(a=>distanceM(settings.center.lat,settings.center.lon,a.lat,a.lon)<=settings.radiusM);
    feedError=null;
    feedUpdatedAt=Date.now();
    feedSourceTimestamp=latest.length ? Math.max(...latest.map(a=>Number(a.timestamp)||0))*1000 : null;
    tracks.update(latest,settings);
    await tracks.flush();
  }catch(e){
    feedError=String(e.message||e);
  }
  broadcast({type:'state',settings,aircraft:latest,tracks:tracks.snapshot(),feedError,feedUpdatedAt,feedSourceTimestamp,ts:Date.now()});
}
// Sequential polling: do not allow a slow FR24 request to overlap the next one
// and later overwrite a newer result with an older response.
async function pollLoop(){
  await poll();
  setTimeout(pollLoop, settings.pollMs);
}
pollLoop();
const port=Number(process.env.PORT)||8787; server.listen(port,()=>console.log(`Air Radar: http://localhost:${port}`));
