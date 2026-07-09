import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface HeaderDropdownProps {
  trigger: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  children: React.ReactNode;
}

export function HeaderDropdown({ trigger, align = 'right', className, children }: HeaderDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute top-full mt-2 z-50 min-w-[240px] bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden p-1.5',
              align === 'right' ? 'right-0' : 'left-0',
              className
            )}
            onClick={() => setOpen(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DropdownItemProps {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'accent';
  badge?: React.ReactNode;
}

export function DropdownItem({ icon, label, description, onClick, variant = 'default', badge }: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left',
        variant === 'danger' && 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20',
        variant === 'accent' && 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
        variant === 'default' && 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      )}
    >
      {icon && <span className="w-4 h-4 flex-shrink-0">{icon}</span>}
      <span className="flex-grow min-w-0">
        <span className="block truncate">{label}</span>
        {description && (
          <span className="block text-xs font-normal text-zinc-400 truncate">{description}</span>
        )}
      </span>
      {badge}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1.5 mx-1" />;
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
      {children}
    </div>
  );
}
