export type PhotoFlightGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
  from: { x: number; y: number; scaleX: number; scaleY: number };
};

export function getPhotoFlightGeometry(
  sourceRect: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
  hasCaption: boolean,
): PhotoFlightGeometry;
