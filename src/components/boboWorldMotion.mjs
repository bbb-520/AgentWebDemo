export function getPhotoFlightGeometry(sourceRect, viewport, hasCaption) {
  const aspectRatio = sourceRect.width > 0 && sourceRect.height > 0
    ? sourceRect.width / sourceRect.height
    : 1;
  const maxWidth = Math.min(930, Math.max(160, viewport.width - 64));
  const availableHeight = viewport.height - (hasCaption ? 260 : 120);
  const maxHeight = Math.min(680, Math.max(160, availableHeight));
  let width = maxWidth;
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  const left = (viewport.width - width) / 2;
  const top = (viewport.height - height) / 2;

  return {
    left,
    top,
    width,
    height,
    from: {
      x: sourceRect.left - left,
      y: sourceRect.top - top,
      scaleX: sourceRect.width / width,
      scaleY: sourceRect.height / height,
    },
  };
}
