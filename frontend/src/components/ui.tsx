import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconName = 'grid' | 'layers' | 'workout' | 'history' | 'trend' | 'arrow' | 'check' | 'plus' | 'clock' | 'chevron' | 'menu' | 'close';
const paths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
  layers: <><path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/></>,
  workout: <><path d="m6 6 12 12M3 7l4-4M2 4l2-2M17 21l4-4M20 22l2-2M4 10l6-6M14 20l6-6"/></>,
  history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/></>,
  trend: <><path d="m3 17 6-6 4 4 8-10M15 5h6v6"/></>,
  arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  menu: <path d="M3 6h18M3 12h18M3 18h18"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function Button({ children, variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}
export function Badge({ children, dark = false }: { children: ReactNode; dark?: boolean }) { return <span className={`badge ${dark ? 'badge-dark' : ''}`}>{children}</span>; }
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="workout" size={28}/></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 tabIndex={-1}>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</header>;
}
