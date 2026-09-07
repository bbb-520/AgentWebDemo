/** 品牌渐变光球：助手头像 / 空状态大球 */
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
      {halo && <span className="orb-halo" />}
      {halo && <span className="orb-halo h2" />}
    </span>
  );
}
