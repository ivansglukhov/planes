const R=6371000;
export function project(lat,lon,center){
  const lat0=center.lat*Math.PI/180;
  return {x:(lon-center.lon)*Math.PI/180*R*Math.cos(lat0),z:-(lat-center.lat)*Math.PI/180*R};
}
export function pointInRadius(x,z,r){return x*x+z*z<=r*r}
