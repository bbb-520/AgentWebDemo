import type { LibraryBook, PhotoBookPage } from './photo-book-pages';

/**
 * 私人相册 —— 图片存放在 OSS 私有 Bucket 的 one-and-one/ 前缀。
 * 浏览器通过同源 API 获取短期签名 URL，本地仓库不再保存照片副本。
 */
export const photoArchiveFiles = [
  'IMG_20260922_102029.jpg',
  'IMG_20260922_102100.jpg',
  'IMG_20260922_102131.jpg',
  'IMG_20260922_102236.jpg',
  'IMG_20260922_102433.jpg',
  'IMG_20260922_102943.jpg',
  'IMG_20260922_103043.jpg',
  'IMG_20260922_103059.jpg',
  'IMG_20260922_103443.jpg',
  'IMG_20260922_103646.jpg',
  'IMG_20260922_103750.jpg',
  'IMG_20260922_103905.jpg',
  'IMG_20260922_104045.jpg',
  'IMG_20260922_104339.jpg',
  'IMG_20260922_104419.jpg',
  'IMG_20260922_104632.jpg',
  'IMG_20260922_104722.jpg',
  'IMG_20260922_105132.jpg',
  'IMG_20260922_105202.jpg',
  'IMG_20260922_105721.jpg',
  'IMG_20260922_105740.jpg',
  'mmexport1784605490401.jpg',
  'Screenshot_20260815_010351_com.ss.android.ugc.aweme_edit_88731596892709.jpg',
  'Screenshot_20260907_145608.jpg',
  'one-and-one-25-classroom.jpg',
  'one-and-one-26-kitten-kiss.jpg',
  'one-and-one-27-confetti-night.jpg',
  'one-and-one-28-gym-mirror.jpg',
  'one-and-one-29-old-camera-screen.jpg',
  'one-and-one-30-kitten-bed.jpg',
  'one-and-one-31-game-farm.jpg',
] as const;

const photoArchiveAlt: Partial<Record<(typeof photoArchiveFiles)[number], string>> = {
  'one-and-one-25-classroom.jpg': '旧教室的光线与黑板',
  'one-and-one-26-kitten-kiss.jpg': '被轻轻亲吻的小猫',
  'one-and-one-27-confetti-night.jpg': '夜空里落下的彩纸',
  'one-and-one-28-gym-mirror.jpg': '健身房镜子里的身影',
  'one-and-one-29-old-camera-screen.jpg': '旧相机里的日期画面',
  'one-and-one-30-kitten-bed.jpg': '床上的小猫',
  'one-and-one-31-game-farm.jpg': '像素游戏里的农场',
};

export const photoArchivePhotos = photoArchiveFiles.map((file, index) => ({
  src: `/api/photo-archive/${encodeURIComponent(file)}`,
  alt: photoArchiveAlt[file] ?? `私人相册照片 ${String(index + 1).padStart(2, '0')}`,
  filename: file,
}));

export const photoArchivePages: PhotoBookPage[] = photoArchivePhotos.map((photo, index) => {
  return {
    id: `photo-archive-${index + 1}`,
    image: photo.src,
    alt: photo.alt,
    sourceFilename: photo.filename,
    caption: `PHOTO ARCHIVE · ${String(index + 1).padStart(2, '0')}`,
  };
});

/** 统一为偏窄的纸张比例，方形照片在纸张色留白中完整呈现。 */
export const photoArchiveBook: LibraryBook = {
  id: 'photo-archive',
  title: 'ONE AND ONE / PHOTO ARCHIVE',
  spineMark: '相册',
  color: '#c8bda8',
  ink: '#315b8f',
  cover: photoArchivePhotos[0].src,
  ratio: 0.75,
  spineHeight: 68,
  pages: photoArchivePages,
};
