import React from 'react';

interface AnimatedRollingNumberProps {
  value: number | string;
  className?: string;
  style?: React.CSSProperties;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

interface DigitSlotProps {
  digit: number;
}

const DigitSlot: React.FC<DigitSlotProps> = React.memo(({ digit }) => {
  return (
    <span
      className="inline-block relative overflow-hidden"
      style={{
        height: '1.18em',
        lineHeight: '1.18em',
        verticalAlign: 'baseline',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span
        className="inline-flex flex-col select-none"
        style={{
          transform: `translateY(-${digit * 10}%)`,
          transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform',
        }}
      >
        {DIGITS.map((d) => (
          <span
            key={d}
            style={{ height: '1.18em', lineHeight: '1.18em' }}
            className="flex items-center justify-center"
          >
            {d}
          </span>
        ))}
      </span>
    </span>
  );
});

export const AnimatedRollingNumber: React.FC<AnimatedRollingNumberProps> = ({
  value,
  className = '',
  style = {},
}) => {
  const str = String(value !== null && value !== undefined ? value : '');

  return (
    <span
      className={`inline-flex items-baseline font-variant-tabular ${className}`}
      style={{
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
        ...style,
      }}
    >
      {str.split('').map((char, index) => {
        const parsed = parseInt(char, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 9) {
          return <DigitSlot key={`slot-${index}`} digit={parsed} />;
        }
        return (
          <span key={`char-${index}`} className="inline-block">
            {char}
          </span>
        );
      })}
    </span>
  );
};
