import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DashboardViewProvider } from "../context/DashboardViewContext";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { currentStaff, teams, onTeamChange, selectedTeamId, signOut, hasPermission } = useAuth();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allNavigationLinks = [
    { path: "/", label: "Dashboard" },
    { path: "/tracker", label: "My Tracker" },
    { path: "/sa-progress", label: "Self Assessment Progress" },
    { path: "/team", label: "Team View" },
    { path: "/annual", label: "Annual Summary" },
    { path: "/targets", label: "Targets Control" },
    { path: "/settings", label: "Settings" },
    { path: "/audit-log", label: "Audit Log" },
  ];

  const navigationLinks = allNavigationLinks.filter(link => hasPermission(link.path));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectTeam = (teamId: number | "all") => {
    onTeamChange(teamId);
    setDropdownOpen(false);
  };

  const buttonLabel = (() => {
    if (selectedTeamId === "all") return "All Teams";
    const found = teams.find(t => t.id.toString() === selectedTeamId);
    return found ? found.name : "Select Team";
  })();

  const userTeamId = currentStaff?.team_id;
  const userTeam = userTeamId ? teams.find(t => t.id === userTeamId) : null;
  const otherTeams = teams.filter(t => t.id !== userTeamId);

  return (
    <DashboardViewProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="sticky top-0 z-50 bg-gradient-to-r from-[#001B47] via-[#0060B8] via-[#007EE0] via-[#FF8A2A] to-[#FFB000] shadow-md py-2 w-full">
          <div className="w-full px-6 flex items-center justify-between">
            <h1 className="text-4xl font-extrabold text-white tracking-wide">Crew Tracker</h1>
            <nav className="hidden md:flex items-center space-x-6 ml-10">
              {navigationLinks.map((link) => (
                <Link key={link.path} to={link.path} className={`text-xl font-semibold text-white hover:opacity-80 transition ${location.pathname === link.path ? "opacity-100" : "opacity-90"}`}>
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setDropdownOpen(!dropdownOpen)} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 py-2 rounded-md transition">
                <span>{buttonLabel}</span>
                <svg className={`w-4 h-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50">
                  <div className="bg-blue-50/50 border-b border-blue-100">
                    {userTeam && (
                      <button
                        onClick={() => handleSelectTeam(userTeam.id)}
                        className={`w-full text-left px-4 py-3 text-sm font-bold text-[#001B47] hover:bg-blue-100 transition ${selectedTeamId === userTeam.id.toString() ? "bg-blue-100" : ""}`}
                      >
                        <span className="truncate">{userTeam.name}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleSelectTeam("all")}
                      className={`w-full text-left px-4 py-3 text-sm font-bold text-[#001B47] hover:bg-blue-100 transition ${selectedTeamId === "all" ? "bg-blue-100" : ""}`}
                    >
                      All Teams
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {otherTeams.length > 0 && (
                      <div className="px-4 py-2 bg-gray-50/50 border-b border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Other Teams</span>
                      </div>
                    )}
                    {otherTeams.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTeam(t.id)}
                        className={`w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition ${selectedTeamId === t.id.toString() ? "bg-blue-50" : ""}`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-gray-200" />
                  <button onClick={signOut} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition font-semibold">
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="w-full px-6 py-6">{children}</main>
      </div>
    </DashboardViewProvider>
  );
};