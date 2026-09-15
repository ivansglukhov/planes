import { distanceM } from './geo.js';
import { readJson, writeJson } from './storage.js';

export class TrackManager {
  constructor(){ this.active=new Map(); this.history=[]; this.dirty=false; }
  async init(){ this.history=await readJson('tracks.json',[]); }
  update(aircraft, settings){
    const now=Date.now();
    const visible=new Set();
    for(const a of aircraft){
      const d=distanceM(settings.center.lat,settings.center.lon,a.lat,a.lon);
      if(d>settings.radiusM) continue;
      visible.add(a.id);
      let t=this.active.get(a.id);
      if(!t){ t={id:`${a.id}-${now}`,aircraftId:a.id,flight:a.flight||a.callsign||'',type:a.type||'',startedAt:now,lastSeen:now,points:[]}; this.active.set(a.id,t); }
      t.lastSeen=now;
      const p={ts:a.timestamp*1000||now,lat:a.lat,lon:a.lon,altitudeM:a.altitudeM};
      const prev=t.points.at(-1);
      if(!prev || prev.lat!==p.lat || prev.lon!==p.lon || prev.altitudeM!==p.altitudeM) t.points.push(p);
    }
    for(const [id,t] of this.active){
      if(!visible.has(id) && now-t.lastSeen>60000){
        t.endedAt=now; this.history.unshift(t); this.active.delete(id); this.dirty=true;
      }
    }
    if(this.history.length>settings.historyTracks) { this.history.length=settings.historyTracks; this.dirty=true; }
  }
  snapshot(){ return {active:[...this.active.values()],history:this.history}; }
  async flush(){ if(this.dirty){this.dirty=false; await writeJson('tracks.json',this.history);} }
}
