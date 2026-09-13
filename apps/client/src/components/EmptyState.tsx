import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Typography } from '@/components/ui/typography';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-full border border-divider">
          <Icon className="size-5 text-neutral-500" aria-hidden />
        </div>
      )}
      <Typography variant="body" className="text-2xl font-medium">
        {title}
      </Typography>
      <Typography variant="caption" className="max-w-xs">
        {description}
      </Typography>
      {children}
    </div>
  );
}
