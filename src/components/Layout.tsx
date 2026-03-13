import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDate } from "../context/DateContext";
import { useAuth } from "../context/AuthContext";
import { DashboardViewProvider } from "../context/DashboardViewContext";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { selectedMonth, selectedYear } = useDate();
  const { currentStaff, allStaff, onStaffChange, isAdmin, selectedStaffId, signOut, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
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

  const isActivePath = (path: string) => location.pathname === path;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!currentStaff) return;

    if (!hasPermission(location.pathname)) {
      const firstAllowedPath = allNavigationLinks.find(link => hasPermission(link.path))?.path || "/login";
      navigate(firstAllowedPath, { replace: true });
    }
  }, [location.pathname, currentStaff, hasPermission, navigate]);

  const handleSelectStaff = (staffId: number | "team") => {
    onStaffChange(staffId);
    setDropdownOpen(false);
  };

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await signOut();
  };

  const buttonLabel = (() => {
    if (selectedStaffId === "team") return "Team View";
    if (selectedStaffId) {
      const found = allStaff.find(s => s.staff_id.toString() === selectedStaffId);
      if (found) return found.name;
    }
    return currentStaff?.name ?? "Select";
  })();

  const signedInUserIsSelected =
    currentStaff && selectedStaffId === currentStaff.staff_id.toString();

  const selectedItem: { label: string; id: number | "team" } | null = (() => {
    if (signedInUserIsSelected) return null;
    if (selectedStaffId === "team") return { label: "Team View", id: "team" };
    if (selectedStaffId) {
      const found = allStaff.find(s => s.staff_id.toString() === selectedStaffId);
      if (found) return { label: found.name, id: found.staff_id };
    }
    return null;
  })();

  const otherStaff = allStaff.filter(s => {
    if (s.is_hidden) return false;
    if (s.staff_id === currentStaff?.staff_id) return false;
    if (selectedStaffId && s.staff_id.toString() === selectedStaffId) return false;
    return true;
  });

  const showTeamViewInOthers = isAdmin && selectedStaffId !== "team";

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
                  {currentStaff && (
                    <button
                      onClick={() => handleSelectStaff(currentStaff.staff_id)}
                      className={`w-full text-left px-4 py-2.5 text-sm font-bold text-[#001B47] hover:bg-blue-50 transition flex items-center gap-2 ${
                        signedInUserIsSelected ? "bg-blue-100" : "bg-white"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-[#001B47] inline-block flex-shrink-0" />
                      {currentStaff.name}
                    </button>
                  )}

                  {selectedItem && (
                    <>
                      <button
                        onClick={() => handleSelectStaff(selectedItem.id)}
                        className="w-full text-left px-4 py-2.5 text-sm font-semibold text-[#001B47] bg-blue-50 hover:bg-blue-100 transition flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block flex-shrink-0" />
                        {selectedItem.label}
                      </button>
                      <div className="border-t-2 border-gray-300" />
                    </>
                  )}

                  {signedInUserIsSelected && (
                    <div className="border-t-2 border-gray-300" />
                  )}

                  {isAdmin && showTeamViewInOthers && (
                    <button
                      onClick={() => handleSelectStaff("team")}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
                    >
                      Team View
                    </button>
                  )}

                  {isAdmin && otherStaff.map((s) => (
                    <button
                      key={s.staff_id}
                      onClick={() => handleSelectStaff(s.staff_id)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
                    >
                      {s.name}
                    </button>
                  ))}

                  <div className="border-t border-gray-200" />
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition font-semibold"
                  >
                    Log Out
                  </button>
                </div>
              )}
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