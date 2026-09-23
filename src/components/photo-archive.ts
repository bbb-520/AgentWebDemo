import type { LibraryBook, PhotoBookPage } from './photo-book-pages';
import { apiUrl } from '../lib/api';

export type PhotoArchivePhoto = {
  src: string;
  alt: string;
  filename: string;
};

type ArchiveObject = {
  filename: string;
  size: number;
};

const OSS_IMAGE_PROCESS_LIMIT = 20 * 1024 * 1024;

/** Read the actual image objects under the backend-configured OSS archive prefix. */
export async function fetchPhotoArchive(baseUrl = '', signal?: AbortSignal): Promise<PhotoArchivePhoto[]> {
  const response = await fetch(apiUrl('/api/photo-archive', baseUrl), {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('相册清单格式无效');

  const objects = payload.filter((item): item is ArchiveObject => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Partial<ArchiveObject>;
    return typeof candidate.filename === 'string'
      && candidate.filename.length > 0
      && typeof candidate.size === 'number'
      && Number.isFinite(candidate.size)
      && candidate.size >= 0;
  });

  return objects.map(({ filename, size }, index) => {
    const path = `/api/photo-archive/${encodeURIComponent(filename)}`;
    // OSS image processing rejects source objects over 20 MiB. Request those
    // directly instead of leaving a permanently broken page in the album.
    const src = size >= OSS_IMAGE_PROCESS_LIMIT ? `${path}?original=true` : path;
    return {
      src,
      alt: `私人相册照片 ${String(index + 1).padStart(2, '0')}`,
      filename,
    };
  });
}

export function createPhotoArchiveBook(photos: PhotoArchivePhoto[]): LibraryBook | null {
  if (photos.length === 0) return null;

  const pages: PhotoBookPage[] = photos.map((photo, index) => ({
    id: `photo-archive-${index + 1}`,
    image: photo.src,
    alt: photo.alt,
    sourceFilename: photo.filename,
    caption: `PHOTO ARCHIVE · ${String(index + 1).padStart(2, '0')}`,
  }));

  return {
    id: 'photo-archive',
    title: 'ONE AND ONE / PHOTO ARCHIVE',
    spineMark: '相册',
    color: '#c8bda8',
    ink: '#315b8f',
    cover: photos[0].src,
    ratio: 0.75,
    spineHeight: 68,
    pages,
  };
}
