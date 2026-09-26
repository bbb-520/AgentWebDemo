export type ImageJobResponseAction = 'success' | 'missing' | 'retry';

/** Distinguishes a permanently missing task from a transient backend failure. */
export function imageJobResponseAction(status: number): ImageJobResponseAction {
  if (status === 404) return 'missing';
  if (status >= 200 && status < 300) return 'success';
  return 'retry';
}

export class ImageJobNotFoundError extends Error {
  readonly jobId: string;

  constructor(jobId: string) {
    super(`Image job not found: ${jobId}`);
    this.name = 'ImageJobNotFoundError';
    this.jobId = jobId;
  }
}
