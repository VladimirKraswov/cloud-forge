import * as React from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Layers,
  Server,
  BookOpen,
  Settings,
  Bell,
  Search,
  Menu,
  ChevronRight,
  Terminal,
  Cpu
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils';

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
}

const NavItem = ({ to, icon: Icon, label }: NavItemProps) => {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  return (
    <Link
      to={to as any}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group",
        isActive
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className={cn("h-5 w-5 transition-transform group-hover:scale-110", isActive ? "text-white" : "text-muted-foreground")} />
      <span>{label}</span>
      {isActive && <ChevronRight className="ml-auto h-4 w-4 opacity-50" />}
    </Link>
  );
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = React.useState(true);

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-zinc-950 flex text-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-0",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center gap-3 px-2 mb-10">
            <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-inner">
               <Cpu className="h-6 w-6 text-white" />
            </div>
            <div className="leading-tight">
               <h2 className="text-xl font-black tracking-tighter">Cloud Forge</h2>
               <p className="text-[10px] font-bold text-primary uppercase tracking-widest opacity-70">Orchestrator v1</p>
            </div>
          </div>

          <nav className="flex-1 space-y-2">
            <div className="px-2 mb-4">
               <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 opacity-50">Main Menu</p>
               <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
               <NavItem to="/jobs" icon={Layers} label="Jobs" />
               <NavItem to="/workers" icon={Server} label="Workers" />
               <NavItem to="/catalog" icon={BookOpen} label="Catalog" />
            </div>

            <div className="px-2 mt-8">
               <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 opacity-50">System</p>
               <NavItem to="/settings" icon={Settings} label="Settings" />
               <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all">
                  <Terminal className="h-5 w-5" />
                  <span>CLI Tools</span>
               </button>
            </div>
          </nav>

          <div className="mt-auto pt-6">
             <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-3 mb-3">
                   <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                   </div>
                   <div className="text-xs">
                      <p className="font-bold">Open Source</p>
                      <p className="text-muted-foreground">Star us on GitHub</p>
                   </div>
                </div>
                <Button variant="outline" size="sm" className="w-full text-xs font-bold rounded-lg h-8">View Repository</Button>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-4 flex-1">
             <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(!isSidebarOpen)}>
                <Menu className="h-6 w-6" />
             </Button>
             <div className="relative w-full max-w-md hidden md:block group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  placeholder="Search jobs, runs, or artifacts..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-zinc-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
             </div>
          </div>

          <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground rounded-full">
                <Bell className="h-5 w-5" />
                <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900" />
             </Button>
             <div className="h-8 w-px bg-slate-200 dark:bg-zinc-800 mx-2" />
             <div className="flex items-center gap-3 pl-2">
                <div className="text-right hidden sm:block">
                   <p className="text-xs font-bold">Admin User</p>
                   <p className="text-[10px] text-muted-foreground font-mono">ID: forge_7h2k</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-primary to-blue-400 border-2 border-white dark:border-zinc-800 shadow-sm" />
             </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
