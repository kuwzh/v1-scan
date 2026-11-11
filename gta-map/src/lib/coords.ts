// Les marqueurs sont stockés en coordonnées normalisées (0..1, y=0 en haut).
// Leaflet CRS.Simple : lat = -y_px, lng = x_px (voir map/mapConfig quand la carte sera ajoutée).
export interface MapSize {
  width: number;
  height: number;
}

export function toLatLng(x: number, y: number, size: MapSize): [number, number] {
  return [-y * size.height, x * size.width];
}

export function fromLatLng(lat: number, lng: number, size: MapSize): { x: number; y: number } {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return { x: clamp(lng / size.width), y: clamp(-lat / size.height) };
}
