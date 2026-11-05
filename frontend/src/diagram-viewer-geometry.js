export function fitDiagram(size, viewport) {
  return Math.min(1, Math.max(1, viewport.width - 48) / size.width, Math.max(1, viewport.height - 48) / size.height);
}

export function constrainDiagram(transform, size, viewport) {
  const bound = (position, length, available) => length <= available
    ? (available - length) / 2 : Math.max(available - length - 24, Math.min(24, position));
  return {...transform, x: bound(transform.x, size.width * transform.scale, viewport.width),
    y: bound(transform.y, size.height * transform.scale, viewport.height)};
}

export function zoomDiagram(transform, scale, anchor, size, viewport) {
  const next = Math.max(Math.min(.1, fitDiagram(size, viewport)), Math.min(8, scale));
  const ratio = next / transform.scale;
  return constrainDiagram({scale: next, x: anchor.x - (anchor.x - transform.x) * ratio,
    y: anchor.y - (anchor.y - transform.y) * ratio}, size, viewport);
}
