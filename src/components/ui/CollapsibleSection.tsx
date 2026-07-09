import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  headerExtra?: React.ReactNode;
  titleClassName?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  headerExtra,
  titleClassName,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50">
        <button
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 text-zinc-400 transition-transform flex-shrink-0',
              isOpen && 'rotate-180'
            )}
          />
          {Icon && <Icon className={cn('w-4 h-4 flex-shrink-0', titleClassName || 'text-blue-600')} />}
          <span
            className={cn(
              'text-sm font-black uppercase tracking-widest truncate',
              titleClassName || 'text-black dark:text-white opacity-80'
            )}
          >
            {title}
          </span>
        </button>
        {headerExtra && <div className="flex items-center gap-2 flex-shrink-0">{headerExtra}</div>}
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
