import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'purple' | 'green' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  pill?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  pill = true,
  fullWidth = false,
  leftIcon,
  rightIcon,
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}) => {
  const { isMinimal, isDark } = useTheme();

  const baseClasses = isMinimal
    ? 'inline-flex items-center justify-center font-dm font-semibold transition-all duration-150 ease-out cursor-pointer select-none focus:outline-none disabled:opacity-50 disabled:pointer-events-none active:translate-y-[1px]'
    : 'inline-flex items-center justify-center font-dm font-extrabold transition-all duration-150 ease-out cursor-pointer select-none focus:outline-none disabled:opacity-50 disabled:pointer-events-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none';

  // Variant Styles for all 4 combinations (Minimal Light, Minimal Dark, Vivid Light, Vivid Dark)
  const variantClasses = isMinimal
    ? isDark
      ? {
          primary:
            'bg-[var(--theme-accent,#FF7A1A)] hover:bg-[var(--theme-accent-hover,#FF9442)] text-[var(--theme-accent-fg,#0D0D0D)] border border-white/25 shadow-[0_6px_18px_-4px_rgba(0,0,0,0.55),0_2px_8px_rgba(255,122,26,0.22)] hover:-translate-y-[1px]',
          secondary:
            'bg-[rgba(255,245,235,0.09)] hover:bg-[rgba(255,245,235,0.15)] text-[#F5EDE4] border border-white/14 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.45)] hover:border-[#FF7A1A]/40 hover:-translate-y-[1px]',
          purple:
            'bg-[rgba(255,245,235,0.11)] hover:bg-[rgba(255,245,235,0.16)] text-[#F5EDE4] border border-white/16 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.45)] hover:-translate-y-[1px]',
          green:
            'bg-[var(--theme-accent,#FF7A1A)] hover:bg-[var(--theme-accent-hover,#FF9442)] text-[var(--theme-accent-fg,#0D0D0D)] border border-white/30 shadow-[0_6px_18px_-4px_rgba(255,122,26,0.28)] hover:-translate-y-[1px]',
          outline:
            'bg-transparent hover:bg-[rgba(255,245,235,0.09)] text-[#F5EDE4] border border-white/16 hover:border-[#FF7A1A]/45',
          ghost:
            'bg-transparent hover:bg-white/10 text-[#F5EDE4] border border-transparent hover:border-white/15',
        }[variant]
      : {
          primary:
            'bg-[var(--theme-accent,#7B5CD6)] hover:bg-[var(--theme-accent-hover,#6546C0)] text-[var(--theme-accent-fg,#FFFFFF)] border border-white/35 shadow-[0_6px_16px_-4px_rgba(91,60,181,0.28),0_1px_3px_rgba(15,23,42,0.08)] hover:shadow-[0_10px_22px_-4px_rgba(91,60,181,0.36)] hover:-translate-y-[1px]',
          secondary:
            'bg-white/86 hover:bg-white text-[#0F172A] border border-slate-300/60 shadow-[0_3px_10px_-2px_rgba(30,41,59,0.06)] hover:border-[#7B5CD6]/40 hover:shadow-[0_6px_16px_-3px_rgba(30,41,59,0.10)] hover:-translate-y-[1px]',
          purple:
            'bg-[#6E4FC9] hover:bg-[#5B3CB5] text-white border border-white/40 shadow-[0_6px_16px_-4px_rgba(91,60,181,0.28)] hover:-translate-y-[1px]',
          green:
            'bg-white/90 hover:bg-white text-[#0F172A] border border-slate-300/60 shadow-[0_3px_10px_-2px_rgba(30,41,59,0.06)] hover:-translate-y-[1px]',
          outline:
            'bg-white/70 hover:bg-white text-[#0F172A] border border-slate-300/60 shadow-2xs',
          ghost:
            'bg-transparent hover:bg-white/70 text-[#0F172A] border border-transparent hover:border-white/80',
        }[variant]
    : isDark
    ? {
        primary:
          'btn-pill-primary bg-[var(--vivid-accent,#D4FF3F)] hover:bg-[var(--vivid-accent-hover,#FF8A1F)] text-[var(--vivid-accent-fg,#0D0D0D)] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] hover:shadow-[3px_3px_0px_#F5F5F0] hover:-translate-x-[1px] hover:-translate-y-[1px]',
        secondary:
          'btn-pill-secondary bg-[#262626] hover:bg-[var(--vivid-accent,#D4FF3F)] text-[#F5F5F0] hover:text-[var(--vivid-accent-fg,#0D0D0D)] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] hover:shadow-[3px_3px_0px_#F5F5F0] hover:-translate-x-[1px] hover:-translate-y-[1px]',
        purple:
          'bg-[#B968F0] hover:bg-[var(--vivid-accent,#D4FF3F)] text-[#0D0D0D] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] hover:shadow-[3px_3px_0px_#F5F5F0]',
        green:
          'bg-[#25D6C1] hover:bg-[var(--vivid-accent,#D4FF3F)] text-[#0D0D0D] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] hover:shadow-[3px_3px_0px_#F5F5F0]',
        outline:
          'bg-[#1F1F1F] hover:bg-[var(--vivid-accent,#D4FF3F)] text-[#F5F5F0] hover:text-[var(--vivid-accent-fg,#0D0D0D)] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]',
        ghost:
          'bg-transparent hover:bg-[#262626] text-[#F5F5F0] border-2 border-transparent hover:border-[#F5F5F0]',
      }[variant]
    : {
        primary:
          'bg-black hover:bg-[#FF851B] text-white hover:text-black border-2 border-black shadow-[2px_2px_0px_#000000] hover:shadow-[3px_3px_0px_#000000] hover:-translate-x-[1px] hover:-translate-y-[1px]',
        secondary:
          'bg-white hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000] hover:shadow-[3px_3px_0px_#000000] hover:-translate-x-[1px] hover:-translate-y-[1px]',
        purple:
          'bg-[#C77DFF] hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000] hover:shadow-[3px_3px_0px_#000000]',
        green:
          'bg-[#25D6C1] hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000] hover:shadow-[3px_3px_0px_#000000]',
        outline:
          'bg-[#FFF8ED] hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000]',
        ghost:
          'bg-transparent hover:bg-[#FFD84D] text-black border-2 border-transparent hover:border-black',
      }[variant];

  const sizeClasses = {
    sm: 'h-9 px-4 text-xs gap-1.5',
    md: 'h-10 px-5 text-[13px] gap-2',
    lg: 'h-12 px-7 text-sm gap-2.5',
    icon: 'w-10 h-10 p-0',
  }[size];

  const shapeClass = pill ? 'rounded-full' : 'rounded-2xl';
  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${shapeClass} ${widthClass} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        <>
          {leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>}
          {children && <span className="whitespace-nowrap leading-none">{children}</span>}
          {rightIcon && <span className="shrink-0 flex items-center">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'rounded';
  active?: boolean;
  badgeDot?: boolean;
  badgeColor?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  size = 'md',
  shape = 'circle',
  active = false,
  badgeDot = false,
  className = '',
  ...props
}) => {
  const { isMinimal, isDark } = useTheme();

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
  }[size];

  const shapeClasses = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  const surfaceClasses = isMinimal
    ? isDark
      ? active
        ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] border border-white/30 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.55)]'
        : 'bg-[rgba(255,245,235,0.09)] hover:bg-[rgba(255,245,235,0.15)] text-[#F5EDE4] border border-white/14 shadow-[0_4px_12px_-3px_rgba(0,0,0,0.45)]'
      : active
      ? 'bg-[#111827] text-white border border-[#111827] shadow-[0_6px_16px_-3px_rgba(15,23,42,0.18)]'
      : 'bg-white/85 hover:bg-white text-[#0F172A] border border-slate-300/60 shadow-[0_3px_10px_-2px_rgba(30,41,59,0.06)]'
    : isDark
    ? active
      ? 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
      : 'bg-[#262626] hover:bg-[var(--vivid-accent,#D4FF3F)] text-[#F5F5F0] hover:text-[var(--vivid-accent-fg,#0D0D0D)] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
    : active
    ? 'bg-[#FF851B] text-black border-2 border-black shadow-[2px_2px_0px_#000000]'
    : 'bg-white hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000]';

  return (
    <button
      type="button"
      className={`relative inline-flex items-center justify-center transition-all duration-150 ease-out cursor-pointer shrink-0 select-none ${sizeClasses} ${shapeClasses} ${surfaceClasses} ${className}`}
      {...props}
    >
      {icon}
      {badgeDot && (
        <span
          className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${
            isMinimal
              ? isDark
                ? 'bg-[var(--theme-accent,#FF7A1A)] border border-[#14100D]'
                : 'bg-[var(--theme-accent,#7B5CD6)] border border-white'
              : isDark
              ? 'bg-[#FF8A1F] border-2 border-[#F5F5F0]'
              : 'bg-[#FF851B] border-2 border-black'
          }`}
        />
      )}
    </button>
  );
};
