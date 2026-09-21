import boboMark from '../assets/bobo-mark.svg';

/** 黑白流线徽记：助手头像 / 空状态大球 */
export function AgentOrb({
  size = 34,
  pulse = false,
  halo = false,
}: {
  size?: number;
  pulse?: boolean;
  halo?: boolean;
}) {
  return (
    <span
      className={`orb${pulse ? ' pulse' : ''}${halo ? ' halo' : ''}`}
      style={{ width: size, height: size }}
    >
      <img className="orb-mark" src={boboMark} alt="bobo" />
      {halo && <span className="orb-halo" />}
      {halo && <span className="orb-halo h2" />}
    </span>
  );
}
