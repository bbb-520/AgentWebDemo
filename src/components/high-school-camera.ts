import type { LibraryBook, PhotoBookPage } from './photo-book-pages';

/**
 * The JPG edition from C:\\Users\\bbb\\Pictures\\高中相机.
 * The original JPGs are copied to public/high-school-camera so Vite can serve
 * them locally without requiring browser access to the user's home folder.
 */
export const highSchoolPhotoFiles = [
  '微信图片_20241126212633.jpg', '微信图片_20241126212642.jpg', '微信图片_20260824090145_24_8.jpg',
  'DSCF0004.JPG', 'DSCF0005.JPG', 'DSCF0006.JPG', 'DSCF0007.JPG', 'DSCF0008.JPG', 'DSCF0009.JPG',
  'DSCF0010.JPG', 'DSCF0011.JPG', 'DSCF0012.JPG', 'DSCF0013.JPG', 'DSCF0014.JPG', 'DSCF0017.JPG',
  'DSCF0018.JPG', 'DSCF0024.JPG', 'DSCF0025.JPG', 'DSCF0026.JPG', 'DSCF0027.JPG', 'DSCF0029.JPG',
  'DSCF0030.JPG', 'DSCF0032.JPG', 'DSCF0033.JPG', 'DSCF0034.JPG', 'DSCF0035.JPG', 'DSCF0036.JPG',
  'DSCF0037.JPG', 'DSCF0038.JPG', 'DSCF0039.JPG', 'DSCF0040.JPG', 'DSCF0042.JPG', 'DSCF0045.JPG',
  'DSCF0046.JPG', 'DSCF0047.JPG', 'DSCF0048.JPG', 'DSCF0049.JPG', 'DSCF0052.JPG', 'DSCF0053.JPG',
  'DSCF0055.JPG', 'DSCF0058.JPG', 'DSCF0059.JPG', 'DSCF0060.JPG', 'DSCF0062.JPG', 'DSCF0063.JPG',
  'DSCF0064.JPG', 'DSCF0065.JPG', 'DSCF0066.JPG', 'DSCF0068.JPG', 'DSCF0069.JPG', 'DSCF0070.JPG',
  'DSCF0071.JPG', 'DSCF0073.JPG', 'DSCF0074.JPG', 'DSCF0075.JPG', 'DSCF0076.JPG', 'DSCF0077.JPG',
  'DSCF0079.JPG', 'DSCF0080.JPG', 'DSCF0081.JPG', 'DSCF0082.JPG', 'DSCF0084.JPG', 'DSCF0085.JPG',
  'DSCF0086.JPG', 'DSCF0089.JPG', 'DSCF0091.JPG', 'DSCF0092.JPG', 'DSCF0094.JPG', 'DSCF0097.JPG',
  'DSCF0098.JPG', 'DSCF0099.JPG', 'DSCF0100.JPG', 'DSCF0101.JPG', 'DSCF0102.JPG', 'DSCF0104.JPG',
  'DSCF0105.JPG', 'DSCF0106.JPG', 'DSCF0107.JPG', 'DSCF0109.JPG', 'DSCF0110.JPG', 'DSCF0111.JPG',
  'DSCF0112.JPG', 'DSCF0113.JPG', 'DSCF0114.JPG', 'DSCF0115.JPG', 'DSCF0116.JPG', 'DSCF0117.JPG',
  'DSCF0118.JPG', 'DSCF0120.JPG', 'DSCF0127.JPG', 'DSCF0128.JPG', 'DSCF0129.JPG', 'DSCF0130.JPG',
  'DSCF0131.JPG', 'DSCF0132.JPG', 'DSCF0134.JPG', 'DSCF0135.JPG', 'DSCF0136.JPG', 'DSCF0137.JPG',
  'DSCF0138.JPG', 'DSCF0139.JPG', 'DSCF0140.JPG', 'DSCF0141.JPG', 'DSCF0143.JPG', 'DSCF0144.JPG',
  'DSCF0145.JPG',
] as const;

// Keep the album intentionally small; a fresh page load chooses a new set.
const selectedHighSchoolFiles = [...highSchoolPhotoFiles]
  .sort(() => Math.random() - 0.5)
  .slice(0, 4);

export const highSchoolPhotos = selectedHighSchoolFiles.map((file, index) => ({
  src: `/high-school-camera/${encodeURIComponent(file)}`,
  alt: `高中相机照片 ${String(index + 1).padStart(2, '0')}`,
  filename: file,
}));

export const highSchoolPages: PhotoBookPage[] = highSchoolPhotos.map((photo, index) => ({
  id: `high-school-${index + 1}`,
  image: photo.src,
  alt: photo.alt,
  sourceFilename: photo.filename,
  width: 4,
  height: 3,
  caption: `高中相机 · ${String(index + 1).padStart(2, '0')}`,
}));

export const highSchoolBook: LibraryBook = {
  id: 'high-school-camera',
  title: '高中相机 / PHOTO ARCHIVE',
  spineMark: '高中',
  color: '#c8bda8',
  ink: '#315b8f',
  cover: highSchoolPages[0].image!,
  ratio: 4 / 3,
  spineHeight: 68,
  pages: highSchoolPages,
};
