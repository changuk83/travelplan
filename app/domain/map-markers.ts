export type MapMarkerPoint = {
  name: string;
  longitude: number;
  latitude: number;
  label: string;
  kind: string;
};

/** Group only the same physical location, not places that merely overlap at low zoom. */
export function groupMapMarkers(points: MapMarkerPoint[]): MapMarkerPoint[][] {
  const groups: MapMarkerPoint[][] = [];
  for (const point of points) {
    const group = groups.find(([anchor]) => {
      const radians = Math.PI / 180;
      const x =
        (anchor.longitude - point.longitude) * radians * Math.cos(((anchor.latitude + point.latitude) / 2) * radians);
      const y = (anchor.latitude - point.latitude) * radians;
      return Math.hypot(x, y) * 6371000 <= 5;
    });
    if (group) group.push(point);
    else groups.push([point]);
  }
  return groups;
}

export function markerGroupIcon(group: MapMarkerPoint[]) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
    );
  const title = group.map((point) => `${point.label}: ${point.name}`).join(" · ");
  if (group.length === 1) {
    const point = group[0];
    return {
      title,
      x: 19,
      y: 19,
      content: `<div class="gildam-map-marker ${escape(point.kind)}" aria-label="${escape(title)}">${escape(point.label)}</div>`,
    };
  }
  const columns = Math.min(group.length, 6);
  const width = columns * 32 + 8;
  const height = Math.ceil(group.length / columns) * 32 + 8;
  return {
    title,
    x: width / 2,
    y: height / 2,
    content: `<div class="gildam-map-marker-group" style="width:${width}px" role="img" aria-label="${escape(title)}">${group.map((point) => `<span class="gildam-map-marker-badge ${escape(point.kind)}" aria-hidden="true">${escape(point.label)}</span>`).join("")}</div>`,
  };
}
