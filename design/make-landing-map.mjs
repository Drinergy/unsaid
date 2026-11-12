// Builds public/landing-map.svg: a dark, flat world map for the landing page backdrop, so the landing page
// needs no map tiles (the free tile quota is for people who enter the map).
// The glowing dots are decoration at big cities (not real thoughts), so the backdrop looks alive.
// Data: Natural Earth 110m land (public domain). Run: node design/make-landing-map.mjs <land.geojson>
import { readFileSync, writeFileSync } from 'node:fs';

const W = 2000;
const [LAT_MIN, LAT_MAX] = [-58, 80]; // Antarctica and the far north are cropped
const mercY = (lat) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2 * W;
const X = (lon) => ((lon + 180) / 360) * W;
const top = mercY(LAT_MAX);
const height = Math.round(mercY(LAT_MIN) - top);

const land = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let d = '';
for (const f of land.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const ring = poly[0];
    if (Math.max(...ring.map((p) => p[1])) < LAT_MIN) continue; // Antarctica
    d += 'M' + ring.map(([lon, lat]) => `${X(lon).toFixed(1)} ${(mercY(Math.min(Math.max(lat, LAT_MIN), LAT_MAX)) - top).toFixed(1)}`).join('L') + 'Z';
  }
}
const cities = [
  [14.6, 121.0, 9], [35.7, 139.7, 7], [40.7, -74.0, 8], [51.5, -0.1, 7], [6.5, 3.4, 6], [-23.5, -46.6, 8],
  [-33.9, 151.2, 6], [19.1, 72.9, 7], [30.0, 31.2, 6], [34.1, -118.2, 7], [19.4, -99.1, 7], [-6.2, 106.8, 7],
  [37.6, 127.0, 6], [41.0, 29.0, 6], [-1.3, 36.8, 5], [55.8, 37.6, 6], [28.6, 77.2, 7], [-34.6, -58.4, 6],
];
const dots = cities
  .map(([lat, lng, r], i) => `<circle class="d" cx="${X(lng).toFixed(1)}" cy="${(mercY(lat) - top).toFixed(1)}" r="${r}" style="animation-delay:${((i * 0.7) % 3).toFixed(1)}s"/>`)
  .join('');
const style = '<style>.d{fill:#ffd6aa;filter:url(#g);animation:p 3s ease-in-out infinite}@keyframes p{0%,100%{opacity:.35}50%{opacity:.95}}@media(prefers-reduced-motion:reduce){.d{animation:none;opacity:.7}}</style>';
const glow = '<defs><filter id="g" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
writeFileSync(
  'public/landing-map.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" preserveAspectRatio="xMidYMid slice">${style}${glow}<path d="${d}" fill="#1a1d24" stroke="#2b303b" stroke-width="1.2" stroke-linejoin="round"/>${dots}</svg>\n`
);
console.log('public/landing-map.svg', height);
