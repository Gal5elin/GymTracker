import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button, Icon, type IconName } from './ui';

export interface NavigationItem { id: string; label: string; href: string; icon: IconName; inProgress?: boolean }
interface Props {
  children: ReactNode;
  navigation: NavigationItem[];
  activePage: string;
  displayName: string;
  roleLabel: string;
  onLogout?: () => void;
  onNavigate?: () => void;
  mainRef?: RefObject<HTMLElement | null>;
}
export default function AppShell({ children, navigation, activePage, displayName, roleLabel, onLogout, onNavigate, mainRef: providedRef }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ownRef = useRef<HTMLElement>(null);
  const mainRef = providedRef ?? ownRef;
  useEffect(() => {
    setMenuOpen(false);
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [activePage, mainRef, displayName]);
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const link = (item: NavigationItem) => <a key={item.id} href={item.href} aria-current={activePage === item.id ? 'page' : undefined} onClick={() => { setMenuOpen(false); onNavigate?.(); }}><Icon name={item.icon}/><span>{item.label}</span>{item.inProgress && <span className="active-dot" aria-label="Workout in progress"/>}</a>;
  const active = navigation.find(item => item.id === activePage);
  return <div className="app-shell">
    <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href={navigation[0]?.href ?? '#account'}><span className="brand-mark"><Icon name="workout" size={23}/></span>GymTracker<span className="brand-period">.</span></a>
      <nav aria-label="Main navigation">{navigation.map(link)}</nav>
      <div className="sidebar-bottom"><div className="profile"><span className="avatar" aria-hidden="true">{initials}</span><div><strong>{displayName}</strong><span>{roleLabel}</span></div></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-left"><button className="menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(current => !current)}><Icon name={menuOpen ? 'close' : 'menu'}/></button><span className="breadcrumb">{roleLabel}<span>/</span><strong>{active?.label ?? 'Workspace'}</strong></span></div>{onLogout && <Button onClick={onLogout}>Sign out</Button>}</header>
      {menuOpen && <nav className="mobile-nav" id="mobile-navigation" aria-label="Mobile navigation">{navigation.map(link)}</nav>}
      <main id="main-content" ref={mainRef} tabIndex={-1}><div className="content">{children}</div></main>
    </div>
  </div>;
}
