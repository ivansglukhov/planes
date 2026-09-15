import crypto from 'node:crypto';
import { cacheJson } from './storage.js';

const URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

function query(settings){
  const {lat,lon}=settings.center, r=Math.round(settings.radiusM);
  return `[out:json][timeout:90];(
way(around:${r},${lat},${lon})["highway"~"^(primary|secondary|primary_link|secondary_link)$"];
way(around:${r},${lat},${lon})["building"];
relation(around:${r},${lat},${lon})["building"];
);out geom;`;
}

export async function getOsm(settings){
  const key=crypto.createHash('sha1').update(JSON.stringify(settings.center)+settings.radiusM).digest('hex').slice(0,16);
  return cacheJson(`osm/${key}.json`, async()=>{
    const r=await fetch(URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'personal-air-radar/0.1'},body:new URLSearchParams({data:query(settings)}),signal:AbortSignal.timeout(95000)});
    if(!r.ok) throw new Error(`Overpass ${r.status}`);
    return r.json();
  });
}
