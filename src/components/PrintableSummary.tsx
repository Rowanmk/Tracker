import React from 'react';

    interface PrintableSummaryProps {
      staffName: string;
      month: number;
      year: number;
      services: Array<{
        name: string;
        delivered: number;
        target: number;
      }>;
      totalDelivered: number;
      totalTarget: number;
      runRateStatus: string;
      onPrint: () => void;
    }

    export const PrintableSummary: React.FC<PrintableSummaryProps> = ({
      staffName,
      month,
      year,
      services,
      totalDelivered,
      totalTarget,
      runRateStatus,
      onPrint,
    }) => {
      const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long' });

      return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Monthly Summary</h3>
            <button
              onClick={onPrint}
              className="btn-primary"
            >
              📄 Print Summary
            </button>
          </div>
          
          <div id="printable-summary" className="print:bg-white print:text-black">
            <div className="print:block hidden">
              <h1 className="text-2xl font-bold mb-4">Performance Summary</h1>
            </div>
            
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white print:text-black mb-2">
                {staffName} - {monthName} {year}
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white print:text-black mb-3">Service Breakdown</h5>
                <div className="space-y-2">
                  {services.map((service, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400 print:text-gray-700">{service.name}:</span>
                      <span className="font-medium text-gray-900 dark:text-white print:text-black">
                        {service.delivered} / {service.target}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h5 className="font-medium text-gray-900 dark:text-white print:text-black mb-3">Overall Performance</h5>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 print:text-gray-700">Total Delivered:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400 print:text-black">{totalDelivered}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 print:text-gray-700">Total Target:</span>
                    <span className="font-bold text-gray-900 dark:text-white print:text-black">{totalTarget}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 print:text-gray-700">Achievement:</span>
                    <span className="font-bold text-gray-900 dark:text-white print:text-black">
                      {totalTarget > 0 ? Math.round((totalDelivered / totalTarget) * 100) : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 print:text-gray-700">Status:</span>
                    <span className="font-bold text-gray-900 dark:text-white print:text-black">{runRateStatus}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="print:block hidden text-xs text-gray-500 mt-8 border-t pt-4">
              Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      );
    };