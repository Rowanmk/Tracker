import React, { createContext, useContext, useState, ReactNode } from "react";

    type DashboardMode = "team" | "individual";
    type ViewMode = "percent" | "numbers";

    interface DashboardViewContextType {
      dashboardMode: DashboardMode;
      setDashboardMode: (mode: DashboardMode) => void;
      viewMode: ViewMode;
      setViewMode: (mode: ViewMode) => void;
    }

    const DashboardViewContext = createContext<DashboardViewContextType | undefined>(undefined);

    export const DashboardViewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
      const [dashboardMode, setDashboardMode] = useState<DashboardMode>("team");
      const [viewMode, setViewMode] = useState<ViewMode>("percent");

      return (
        <DashboardViewContext.Provider
          value={{
            dashboardMode,
            setDashboardMode,
            viewMode,
            setViewMode,
          }}
        >
          {children}
        </DashboardViewContext.Provider>
      );
    };

    export const useDashboardView = (): DashboardViewContextType => {
      const ctx = useContext(DashboardViewContext);
      if (!ctx) {
        throw new Error("useDashboardView must be used within a DashboardViewProvider");
      }
      return ctx;
    };