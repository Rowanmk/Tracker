import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useDate } from "../context/DateContext";
import { useAuth } from "../context/AuthContext";
import { DashboardViewProvider } from "../context/DashboardViewContext";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { selectedMonth, selectedYear } = useDate();
  const { currentStaff, allStaff, onStaffChange, isAdmin, selectedStaffId, signOut } = useAuth();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectStaff = (staffId: number | "team") => {
    onStaffChange(staffId);
    setDropdownOpen(false);
  };

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await signOut();
  };

  // The label shown on the dropdown button — always the signed-in user's name
  const buttonLabel = currentStaff?.name ?? "Select";

  // Other staff members (excluding the signed-in user)
  const otherStaff = allStaff.filter(
    (s) => !s.is_hidden && s.staff_id !== currentStaff?.staff_id
  );

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

            {/* User dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 py-2 rounded-md transition"
              >
                <span>{buttonLabel}</span>
                <svg
                  className={`w-4 h-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50">
                  {/* Current user — highlighted */}
                  {currentStaff && (
                    <button
                      onClick={() => {
                        handleSelectStaff(currentStaff.staff_id);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm font-bold text-[#001B47] bg-blue-50 hover:bg-blue-100 transition flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#001B47] inline-block flex-shrink-0" />
                      {currentStaff.name}
                    </button>
                  )}

                  {/* Admin-only: Team view option */}
                  {isAdmin && (
                    <button
                      onClick={() => handleSelectStaff("team")}
                      className={`w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition ${
                        selectedStaffId === "team" ? "font-semibold" : ""
                      }`}
                    >
                      Team View
                    </button>
                  )}

                  {/* Other staff — admin only */}
                  {isAdmin && otherStaff.length > 0 && (
                    <>
                      <div className="border-t border-gray-100 mx-3 my-1" />
                      {otherStaff.map((s) => (
                        <button
                          key={s.staff_id}
                          onClick={() => handleSelectStaff(s.staff_id)}
                          className={`w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition ${
                            selectedStaffId === s.staff_id.toString() ? "font-semibold text-[#001B47]" : ""
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </>
                  )}

                  {/* Log Out */}
                  <div className="border-t border-gray-200 mt-1" />
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition font-semibold"
                  >
                    Log Out
                  </button>
                </div>
              )}
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