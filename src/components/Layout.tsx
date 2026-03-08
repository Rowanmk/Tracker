import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useDate } from "../context/DateContext";
import { useAuth } from "../context/AuthContext";
import { DashboardViewProvider } from "../context/DashboardViewContext";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { selectedMonth, selectedYear } = useDate();
  const { currentStaff, allStaff, onStaffChange, isAdmin, selectedStaffId, signOut } = useAuth();
  const location = useLocation();

  const baseNavigationLinks = [
    { path: "/", label: "Dashboard" },
    { path: "/tracker", label: "My Tracker" },
    { path: "/sa-progress", label: "Self Assessment Progress" },
    { path: "/team", label: "Team View" },
    { path: "/annual", label: "Annual Summary" },
  ];

  const adminNavigationLinks = [
    { path: "/targets", label: "Targets Control" },
    { path: "/settings", label: "Settings" },
  ];

  const navigationLinks = isAdmin
    ? [...baseNavigationLinks, ...adminNavigationLinks]
    : baseNavigationLinks;

  const isActivePath = (path: string) => location.pathname === path;

  const handleStaffChange = (value: string) => {
    if (value === "team") {
      onStaffChange("team");
    } else {
      onStaffChange(Number(value));
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <DashboardViewProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header
          className="
            sticky top-0 z-50 
            bg-gradient-to-r from-[#001B47] via-[#0060B8] via-[#007EE0] via-[#FF8A2A] to-[#FFB000]
            shadow-md py-2 w-full
          "
        >
          <div className="w-full px-6 flex items-center justify-between">
            <h1 className="text-4xl font-extrabold text-white tracking-wide">
              Crew Tracker
            </h1>

            <nav className="hidden md:flex items-center space-x-6 ml-10">
              {navigationLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`
                    text-xl font-semibold text-white hover:opacity-80 transition
                    ${isActivePath(link.path) ? "opacity-100" : "opacity-90"}
                  `}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center space-x-3">
              {/* Staff selector — admin only */}
              {isAdmin && (
                <select
                  className="bg-white text-gray-900 px-2 py-1 rounded-md shadow cursor-pointer"
                  value={selectedStaffId === "team" ? "team" : selectedStaffId || currentStaff?.staff_id || ""}
                  onChange={(e) => handleStaffChange(e.target.value)}
                >
                  <option value="team">Team</option>
                  {allStaff.map((staff) => (
                    <option key={staff.staff_id} value={staff.staff_id}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Logged-in user display */}
              {currentStaff && (
                <span className="text-white text-sm font-medium hidden md:block">
                  {currentStaff.name}
                </span>
              )}

              {/* Sign out button */}
              <button
                onClick={handleSignOut}
                className="bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-3 py-1 rounded-md transition"
              >
                Sign Out
              </button>
            </div>

            <div className="md:hidden">
              <button className="text-white p-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>

          <div className="md:hidden bg-black/10 border-t border-white/20">
            <div className="px-6 py-2 space-y-1">
              {navigationLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`
                    block px-3 py-2 rounded-md text-sm font-medium transition-all duration-200
                    ${isActivePath(link.path)
                      ? "bg-white/20 text-white"
                      : "text-white/80 hover:text-white hover:bg-white/10"
                    }
                  `}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </header>

        <main className="w-full px-6 py-6">
          {children}
        </main>
      </div>
    </DashboardViewProvider>
  );
};