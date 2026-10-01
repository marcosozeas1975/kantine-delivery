import React from 'react';

interface KantineLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
}

export const KantineLogo: React.FC<KantineLogoProps> = ({
  size = 40,
  color = '#1b2d56',
  className = '',
  ...props
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      fill="none"
      {...props}
    >
      <g fill={color}>
        {/* Haste Vertical com Serifas Arredondadas (Stem) */}
        <path d="M 70 46 H 178 C 162 46, 156 68, 156 112 V 400 C 156 444, 162 466, 178 466 H 70 C 86 466, 92 444, 92 400 V 112 C 92 68, 86 46, 70 46 Z" />

        {/* Braço Superior Diagonal com Serifa Superior (Upper Arm) */}
        <path d="M 175 252 L 314 46 H 392 C 382 60, 372 74, 362 88 L 232 232 Z" />

        {/* Perna Inferior com Curva Sabre / Swoop Caligráfico (Lower Leg) */}
        <path d="M 175 252 L 232 232 C 240 278, 260 322, 296 364 C 342 418, 394 452, 442 464 C 404 464, 366 452, 332 428 C 255 372, 205 304, 175 252 Z" />

        {/* Junção Central Sólida */}
        <path d="M 156 220 L 190 252 L 156 284 Z" />
      </g>
    </svg>
  );
};

export default KantineLogo;
