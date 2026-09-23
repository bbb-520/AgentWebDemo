import boboMark from '../assets/bobo-mark.svg';
import BoboFlipbook from './BoboFlipbook';
import { highSchoolPhotos } from './high-school-camera';

interface Props {
  onBack: () => void;
  onStart: () => void;
}

export default function AboutBobo({ onBack, onStart }: Props) {
  return (
    <div className="about-page">
      <header className="about-nav">
        <button className="about-back" onClick={onBack} aria-label="返回开始页">
          <span aria-hidden="true">←</span> 返回
        </button>
        <div className="about-logo"><img src={boboMark} alt="" /><span>bobo</span></div>
        <button className="about-chat" onClick={onStart}>和 bobo 聊聊 <span aria-hidden="true">↗</span></button>
      </header>

      <main>
        <section className="about-hero">
          <p className="about-kicker">ABOUT BOBO · MEMORY CURATOR</p>
          <h1>把被忘记的瞬间，<br /><em>重新放回生活。</em></h1>
          <p className="about-lede">照片不是档案。它们是某个下午的风、朋友说过的话，<br className="about-wide" />以及后来再也回不去的光。</p>
          <div className="about-scroll-note"><span>01</span><i />向下看看</div>
        </section>

        <section className="about-story">
          <div className="about-story-copy">
            <p className="about-kicker">THE IDEA</p>
            <h2>从相册里，<br />找回那些“差点忘了”的事。</h2>
            <p>把照片交给 bobo。它会替你看见重复、留白和情绪，把散落在文件夹里的日子整理成一段可以重新走进去的记忆。</p>
            <div className="about-stats"><span><b>06</b> 个片段</span><span><b>01</b> 个故事</span></div>
          </div>
          <div className="about-story-image"><img src={highSchoolPhotos[2].src} alt={highSchoolPhotos[2].alt} /></div>
        </section>

        <section className="about-gallery" aria-label="照片记忆">
          <div className="flipbook-intro">
            <p className="about-kicker">BOBO / PHOTO BOOK</p>
            <h2>把相册翻成一段<br /><em>可以回去的时间。</em></h2>
            <p>来自“高中相机”的 {highSchoolPhotos.length} 张照片。点击悬浮书册打开它，书页可以点击或用方向键翻动。</p>
          </div>
          <BoboFlipbook />
        </section>

        <section className="about-end">
          <img src={boboMark} alt="" />
          <p>每一张照片，都在等一个重新被看见的时刻。</p>
          <button onClick={onStart}>开始一段新的对话 <span aria-hidden="true">→</span></button>
        </section>
      </main>

    </div>
  );
}
