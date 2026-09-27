import type { Conversation, ImageJobRef } from '../types';

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

/** Reconciles persisted cards with an authoritative successful server response. */
export function reconcileImageJobs(conversation: Conversation, jobs: ImageJobRef[]): Conversation {
  const fresh = new Map(jobs.map((job) => [job.jobId, job]));
  const latestAssistantIndex = conversation.messages.reduce(
    (index, message, current) => message.role === 'assistant' ? current : index,
    -1,
  );

  return {
    ...conversation,
    messages: conversation.messages.map((message, index) => {
      const existing = (message.imageJobs ?? [])
        .map((job) => fresh.get(job.jobId))
        .filter((job): job is ImageJobRef => Boolean(job));
      if (index !== latestAssistantIndex) return { ...message, imageJobs: existing };
      const known = new Set(existing.map((job) => job.jobId));
      return {
        ...message,
        imageJobs: [...existing, ...jobs.filter((job) => !known.has(job.jobId))],
      };
    }),
  };
}
