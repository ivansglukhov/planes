const R=6371000;
export function project(lat,lon,center){
  const lat0=center.lat*Math.PI/180;
  return {x:(lon-center.lon)*Math.PI/180*R*Math.cos(lat0),z:-(lat-center.lat)*Math.PI/180*R};
}
export function pointInRadius(x,z,r){return x*x+z*z<=r*r}
export function distanceM(aLat,aLon,bLat,bLon){
  const p1=aLat*Math.PI/180,p2=bLat*Math.PI/180;
  const dp=(bLat-aLat)*Math.PI/180,dl=(bLon-aLon)*Math.PI/180;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
