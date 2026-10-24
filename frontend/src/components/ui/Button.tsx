import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Spinner } from './Spinner';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-none transition-all duration-150 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] dark:focus-visible:ring-[#818CF8] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#09090B] disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.985] select-none';

    const variants = {
      primary:
        'bg-[#18181B] text-white hover:bg-[#27272A] active:bg-[#3F3F46] shadow-sm dark:bg-[#F4F4F5] dark:text-[#09090B] dark:hover:bg-[#D4D4D8] dark:active:bg-[#A1A1AA] border border-transparent',
      secondary:
        'bg-[#E4E4E7] text-[#18181B] hover:bg-[#D4D4D8] active:bg-[#A1A1AA] border border-transparent dark:bg-[#27272A] dark:text-[#FAFAFA] dark:hover:bg-[#3F3F46] dark:active:bg-[#52525B]',
      outline:
        'border border-[#D4D4D8] dark:border-[#3F3F46] bg-white dark:bg-[#09090B] text-[#27272A] dark:text-[#E4E4E7] hover:bg-[#F4F4F5] dark:hover:bg-[#18181B] hover:text-[#18181B] dark:hover:text-[#FFFFFF] active:bg-[#E4E4E7] dark:active:bg-[#27272A] shadow-xs',
      ghost:
        'bg-transparent text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] hover:text-[#18181B] dark:hover:text-[#FAFAFA] active:bg-[#E4E4E7] dark:active:bg-[#3F3F46]',
      danger:
        'bg-[#B91C1C] text-white hover:bg-[#991B1B] active:bg-[#7F1D1D] shadow-sm dark:bg-[#991B1B] dark:hover:bg-[#B91C1C]',
      accent:
        'bg-[#4F46E5] text-white hover:bg-[#4338CA] active:bg-[#3730A3] shadow-sm dark:bg-[#6366F1] dark:hover:bg-[#4F46E5] dark:active:bg-[#4338CA] border border-transparent',
    };

    const sizes = {
      sm: 'text-xs px-2.5 py-1.5 gap-1.5',
      md: 'text-sm px-3.5 py-2 gap-2',
      lg: 'text-base px-5 py-2.5 gap-2.5',
    };

    const spinnerColor = variant === 'primary' || variant === 'danger'
      ? 'text-current'
      : 'text-zinc-900 dark:text-[#f4f4f5]';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? 'true' : undefined}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <Spinner size="sm" className={cn('shrink-0', spinnerColor)} label="Loading..." />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
