const R = 6371000;
export function bboxForRadius(lat, lon, radiusM) {
  const dLat = radiusM / R * 180 / Math.PI;
  const dLon = radiusM / (R * Math.cos(lat * Math.PI / 180)) * 180 / Math.PI;
  return { north: lat+dLat, south: lat-dLat, west: lon-dLon, east: lon+dLon };
}
export function distanceM(aLat,aLon,bLat,bLon){
  const p1=aLat*Math.PI/180,p2=bLat*Math.PI/180;
  const dp=(bLat-aLat)*Math.PI/180,dl=(bLon-aLon)*Math.PI/180;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
