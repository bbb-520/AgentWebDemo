declare module '*.jsx' {
  import type { ComponentType } from 'react';

  type CircularGalleryItem = {
    image: string;
    text: string;
  };

  type ReactBitsJSXProps = {
    items?: CircularGalleryItem[];
    images?: Array<string | { src: string; alt?: string }>;
    bend?: number;
    textColor?: string;
    borderRadius?: number;
    font?: string;
    fontUrl?: string;
    scrollSpeed?: number;
    scrollEase?: number;
    fit?: number;
    fitBasis?: 'auto' | 'min' | 'max' | 'width' | 'height';
    minRadius?: number;
    maxRadius?: number;
    padFactor?: number;
    overlayBlurColor?: string;
    maxVerticalRotationDeg?: number;
    dragSensitivity?: number;
    enlargeTransitionMs?: number;
    segments?: number;
    dragDampening?: number;
    openedImageWidth?: string;
    openedImageHeight?: string;
    imageBorderRadius?: string;
    openedImageBorderRadius?: string;
    grayscale?: boolean;
    [key: string]: unknown;
  };

  const ReactBitsComponent: ComponentType<ReactBitsJSXProps>;
  export default ReactBitsComponent;
}
