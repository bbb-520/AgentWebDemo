import type { ImageJobRef } from '../types';
import './image-job.css';

const STATUS: Record<ImageJobRef['status'], string> = {
  QUEUED: '排队中',
  PROCESSING: '正在生成',
  SUCCEEDED: '已完成',
  FAILED: '生成失败',
  CANCELED: '已取消',
  EXPIRED: '已过期',
};

export function ImageJobCard({ job }: { job: ImageJobRef }) {
  const running = job.status === 'QUEUED' || job.status === 'PROCESSING';
  return (
    <section className={`image-job-card image-job-${job.status.toLowerCase()}`} aria-live={running ? 'polite' : undefined}>
      <div className="image-job-topline">
        <span className="image-job-kicker">bobo / image note</span>
        <span className="image-job-status"><i />{STATUS[job.status]}</span>
      </div>
      {job.imageUrl ? (
        <a className="image-job-result" href={job.imageUrl} target="_blank" rel="noreferrer">
          <img src={job.imageUrl} alt="图片二次生成结果" loading="lazy" />
          <span>打开高清成品</span>
        </a>
      ) : (
        <div className="image-job-pending">
          <span className="image-job-scan" aria-hidden="true" />
          <div>
            <strong>{running ? '照片已经进入后台' : '这次生成没有留下成品'}</strong>
            <p>{running ? '可以继续浏览对话，完成后会自动出现在这里。' : (job.error || '请稍后重试。')}</p>
          </div>
        </div>
      )}
      {job.rationale && <p className="image-job-rationale">{job.rationale}</p>}
      <div className="image-job-foot">{job.mode === 'distillation' ? '影像蒸馏' : '实景拼贴'} · 私人档案</div>
    </section>
  );
}
