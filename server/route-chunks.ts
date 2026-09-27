type Point = { longitude: number; latitude: number };

/** Treat up to five metres as the same arrival point (e.g. hotel and its restaurant). */
export function sameRoutePoint(a: Point, b: Point) {
  const radians = Math.PI / 180;
  const x = (a.longitude - b.longitude) * radians * Math.cos(((a.latitude + b.latitude) / 2) * radians);
  const y = (a.latitude - b.latitude) * radians;
  return Math.hypot(x, y) * 6371000 <= 5;
}

/** Input has adjacent duplicate coordinates removed; preserve every remaining segment. */
export function splitDrivingRoute<T extends Point>(points: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < points.length - 1; index += 6) {
    const chunk = points.slice(index, index + 7);
    const first = chunk[0];
    const last = chunk.at(-1)!;
    const closed = sameRoutePoint(first, last);
    if (closed && chunk.length > 2) {
      // The first distinct waypoint opens both halves of a round trip.
      chunks.push(chunk.slice(0, 2), chunk.slice(1));
    } else {
      chunks.push(chunk);
    }
  }
  return chunks;
}
