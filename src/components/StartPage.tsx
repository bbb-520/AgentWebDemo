import { useEffect, useRef, useState } from 'react';
import landingWallpaper from '../assets/landing-wallpaper.jpg';
import ParticleText from './ParticleText';

interface Props {
  onStart: () => void;
  demoMode: boolean;
}

const SUBTITLES = [
  '正在和下一站相遇',
  '天气、景点与行程，一次聊清楚',
  '从一句提问，到一份可执行的计划',
];

/**
 * 入口页参考 summerWeb-temp：暖色编辑感画布、固定导航、壁纸叠层、
 * 居中 Hero 和轻量的副标题轮播。进入聊天仍使用原有 hash 路由。
 */
export default function StartPage({ onStart, demoMode }: Props) {
  const [leaving, setLeaving] = useState(false);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const [typedSubtitle, setTypedSubtitle] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const timer = useRef<number | null>(null);

  const go = () => {
    if (leaving) return;
    setLeaving(true);
    timer.current = window.setTimeout(onStart, 420);
  };

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    const target = SUBTITLES[subtitleIndex];
    const finishedTyping = typedSubtitle === target && !isDeleting;
    const finishedDeleting = typedSubtitle.length === 0 && isDeleting;
    const delay = finishedTyping ? 1700 : finishedDeleting ? 420 : isDeleting ? 42 : 78;
    const timeout = window.setTimeout(() => {
      if (finishedTyping) {
        setIsDeleting(true);
      } else if (finishedDeleting) {
        setIsDeleting(false);
        setSubtitleIndex((index) => (index + 1) % SUBTITLES.length);
      } else if (isDeleting) {
        setTypedSubtitle((value) => value.slice(0, -1));
      } else {
        setTypedSubtitle(target.slice(0, typedSubtitle.length + 1));
      }
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [isDeleting, subtitleIndex, typedSubtitle]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        go();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={`start reference-landing${leaving ? ' leaving' : ''}`}>
      <div className="start-wallpaper" aria-hidden="true">
        <img src={landingWallpaper} alt="" />
        <div className="start-wallpaper-wash" />
        <div className="start-wallpaper-grain" />
      </div>

      <header className="start-nav">
        <button className="start-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="start-brand-mark">✦</span>
          <span className="start-brand-name">bobo</span>
        </button>

        <nav className="start-nav-center" aria-label="首页导航">
          <span className="active">首页</span>
          <span>能力</span>
          <span>关于 bobo</span>
        </nav>

        <button className="start-nav-link" onClick={go}>
          进入工作台 <span aria-hidden="true">↗</span>
        </button>
      </header>

      <main className="start-main">
        <ParticleText text="bobo" />
        <p className="start-desc start-typed" aria-live="polite">
          {typedSubtitle}<span className="start-cursor" aria-hidden="true">▊</span>
        </p>
      </main>
    </div>
  );
}
