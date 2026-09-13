'use client';

import { Activity, Bell, History, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ModuleRail — the 72px icon rail that switches the console's primary module.
 *
 * Modelled on the Kwik 112 console's left rail: icon-only actions with a
 * 10px label, the active module marked by a 2px left border in --accent. The
 * Alerts item surfaces the count of unacknowledged operational alerts.
 *
 * The rail is chrome, so it (and only it, plus the command bar) carries
 * `select-none`; the incident panel and map stay selectable so an operator can
 * copy an address or a caller number.
 */
export type ModuleId = 'monitoring' | 'alerts' | 'history' | 'forecast';

interface RailItem {
  id: ModuleId;
  label: string;
  Icon: typeof Activity;
}

const RAIL_ITEMS: RailItem[] = [
  { id: 'monitoring', label: 'Monitor', Icon: Activity },
  { id: 'alerts', label: 'Alerts', Icon: Bell },
  { id: 'history', label: 'History', Icon: History },
  { id: 'forecast', label: 'Forecast', Icon: TrendingUp },
];

export function ModuleRail({
  active,
  onSelect,
  alertCount,
}: {
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
  alertCount: number;
}) {
  return (
    <nav
      aria-label="Console modules"
      className="fixed inset-x-0 bottom-0 z-[800] flex h-14 w-full shrink-0 flex-row items-stretch border-t border-rule-strong bg-deep select-none sm:static sm:h-full sm:w-[72px] sm:flex-col sm:gap-1 sm:border-r sm:border-t-0 sm:py-2"
    >
      {RAIL_ITEMS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        const showBadge = id === 'alerts' && alertCount > 0;
        // The count badge is aria-hidden (it is decorative chrome over the icon),
        // so fold it into the button's accessible name — otherwise a screen-reader
        // user hears "Alerts" with no indication that any are open.
        const accessibleLabel = showBadge
          ? `${label}, ${alertCount} unacknowledged`
          : label;
        return (
          <button
            key={id}
            type="button"
            aria-label={accessibleLabel}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => onSelect(id)}
            className={cn(
              'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-b-2 px-1 py-1.5 transition-colors sm:flex-none sm:justify-start sm:gap-1 sm:border-b-0 sm:border-l-2 sm:py-2.5',
              isActive
                ? 'border-b-accent bg-panel text-ink sm:border-b-transparent sm:border-l-accent'
                : 'border-transparent text-ink-3 hover:bg-panel hover:text-ink-2',
            )}
          >
            <span className="relative">
              <Icon className="h-5 w-5" aria-hidden />
              {showBadge && (
                <span
                  className="tnum absolute -right-2 -top-1.5 inline-flex min-w-[15px] items-center justify-center rounded-full bg-critical px-1 text-2xs font-semibold text-ink"
                  aria-hidden
                >
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </span>
            <span className="max-w-full truncate text-2xs font-medium tracking-wide">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default ModuleRail;
