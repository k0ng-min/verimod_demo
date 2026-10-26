/** Microsoft Fluent Emoji 3D(MIT) 렌더를 투명 배경 WEBP로 쓴다. 출처는 ASSET_LICENSES.md·public/3d/SOURCES.json.
 * 레퍼런스(finance_challenge)의 Icon3D와 같은 구조·같은 그림자 규칙(.icon3d)을 쓴다. */
export function Icon3D({ src, size = 64, className }: { src: string; size?: number; className?: string }) {
  return (
    <img
      src={`/3d/${src}.webp`}
      alt=""
      draggable={false}
      className={`icon3d${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
    />
  )
}
