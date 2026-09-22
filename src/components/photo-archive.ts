import type { LibraryBook, PhotoBookPage } from './photo-book-pages';

/**
 * 私人相册 —— 图片来自 D:\photo（用户指定替换「关于bbb」页的全部照片）。
 * 网页版副本（最长边 2048 / JPEG q85 / EXIF 方向已烘焙）存放在
 * public/photo-archive，由脚本从原图生成；原图不进入仓库。
 * 文件名保持与原图一致，便于追溯。
 */
export const photoArchiveFiles = [
  'IMG_20220604_224727.jpg', // 2022-06-04 · 横 4:3
  '1721485740269.jpeg',      // 2024-07-20 · 横 4:3
  'IMG_20250101_000042.jpg', // 2025-01-01 · 竖 3:4
  'IMG_20250808_201231.jpg', // 2025-08-08 · 竖 3:4
  'retouch_2026050913393991.jpg', // 2026-05-09 · 竖 3:4
  'IMG_20260820_130824.jpg', // 2026-08-20 · 竖 3:4
  'IMG_20260916_171149.jpg', // 2026-09-16 · 方 1:1
] as const;

/** 与 photoArchiveFiles 一一对应的声明宽高（用于 3D 书页比例推导）。 */
const photoArchiveDimensions: Record<(typeof photoArchiveFiles)[number], [number, number]> = {
  'IMG_20220604_224727.jpg': [4, 3],
  '1721485740269.jpeg': [4, 3],
  'IMG_20250101_000042.jpg': [3, 4],
  'IMG_20250808_201231.jpg': [3, 4],
  'retouch_2026050913393991.jpg': [3, 4],
  'IMG_20260820_130824.jpg': [3, 4],
  'IMG_20260916_171149.jpg': [1, 1],
};

export const photoArchivePhotos = photoArchiveFiles.map((file, index) => ({
  src: `/photo-archive/${encodeURIComponent(file)}`,
  alt: `私人相册照片 ${String(index + 1).padStart(2, '0')}`,
  filename: file,
}));

export const photoArchivePages: PhotoBookPage[] = photoArchivePhotos.map((photo, index) => {
  const [width, height] = photoArchiveDimensions[photoArchiveFiles[index]];
  return {
    id: `photo-archive-${index + 1}`,
    image: photo.src,
    alt: photo.alt,
    sourceFilename: photo.filename,
    width,
    height,
    caption: `PHOTO ARCHIVE · ${String(index + 1).padStart(2, '0')}`,
  };
});

/** 竖版照片占多数（5/7），书页取 3:4 竖版；横/方图按纸张色 contain 适配。 */
export const photoArchiveBook: LibraryBook = {
  id: 'photo-archive',
  title: '私人相册 / PHOTO ARCHIVE',
  spineMark: '相册',
  color: '#c8bda8',
  ink: '#315b8f',
  cover: '/photo-archive/IMG_20250101_000042.jpg',
  ratio: 0.75,
  spineHeight: 68,
  pages: photoArchivePages,
};
