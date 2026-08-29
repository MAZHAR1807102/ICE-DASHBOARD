import React from 'react';

export default function AdvisorDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header Section */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Student Advisor Portal</h1>
        <p className="text-gray-600">Prof. Mazharul Islam | Imperial College of Engineering</p>
      </header>

      {/* Advisee Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-indigo-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Total Advisees</h3>
          <p className="text-2xl font-bold text-gray-900">60</p>
          <p className="text-xs text-gray-500 mt-1">Assigned Cohort</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-red-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">High Risk Students</h3>
          <p className="text-2xl font-bold text-red-700">3</p>
          <p className="text-xs text-gray-500 mt-1">Requires immediate intervention</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-yellow-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Backlog Alerts</h3>
          <p className="text-2xl font-bold text-yellow-700">8</p>
          <p className="text-xs text-gray-500 mt-1">Failed/pending courses</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-t-4 border-blue-500">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Recent Consultations</h3>
          <p className="text-2xl font-bold text-blue-700">12</p>
          <p className="text-xs text-gray-500 mt-1">Logged this month</p>
        </div>
      </div>

      {/* Assigned Students List */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">My Advisees</h2>
          <div className="space-x-2">
            <button className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700">
              Log Counseling Session
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="p-3 text-sm font-medium text-gray-600">ID</th>
                <th className="p-3 text-sm font-medium text-gray-600">Name</th>
                <th className="p-3 text-sm font-medium text-gray-600">Sem.</th>
                <th className="p-3 text-sm font-medium text-gray-600">Attendance</th>
                <th className="p-3 text-sm font-medium text-gray-600">CGPA</th>
                <th className="p-3 text-sm font-medium text-gray-600">Backlogs</th>
                <th className="p-3 text-sm font-medium text-gray-600">Risk Level</th>
                <th className="p-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b hover:bg-gray-50">
                <td className="p-3 text-sm">014</td>
                <td className="p-3 text-sm font-medium">Student M</td>
                <td className="p-3 text-sm">3</td>
                <td className="p-3 text-sm text-green-600 font-medium">92%</td>
                <td className="p-3 text-sm">3.75</td>
                <td className="p-3 text-sm">0</td>
                <td className="p-3 text-sm"><span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Normal</span></td>
                <td className="p-3 text-sm"><button className="text-blue-600 hover:underline">View Profile</button></td>
              </tr>
              <tr className="border-b hover:bg-gray-50">
                <td className="p-3 text-sm">042</td>
                <td className="p-3 text-sm font-medium">Student X</td>
                <td className="p-3 text-sm">5</td>
                <td className="p-3 text-sm text-yellow-600 font-medium">70%</td>
                <td className="p-3 text-sm">2.80</td>
                <td className="p-3 text-sm">1</td>
                <td className="p-3 text-sm"><span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">Medium</span></td>
                <td className="p-3 text-sm"><button className="text-blue-600 hover:underline">Message</button></td>
              </tr>
              <tr className="border-b hover:bg-gray-50">
                <td className="p-3 text-sm">088</td>
                <td className="p-3 text-sm font-medium">Student Z</td>
                <td className="p-3 text-sm">3</td>
                <td className="p-3 text-sm text-red-600 font-medium">55%</td>
                <td className="p-3 text-sm">2.10</td>
                <td className="p-3 text-sm">3</td>
                <td className="p-3 text-sm"><span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">High</span></td>
                <td className="p-3 text-sm"><button className="text-red-600 font-medium hover:underline">Escalate to HOD</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Escalation System (Level 2 to Level 3) */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h2 className="text-lg font-semibold mb-3 text-gray-800">Escalation System (Level 2)</h2>
        <p className="text-sm text-gray-700 mb-4">
          For recurring issues (e.g., repeated absences despite counseling or serious academic failure), escalate the matter to Level 3 (HOD) for review.
        </p>
        <button className="bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700">
          Create HOD Escalation Ticket
        </button>
      </div>
    </div>
  );
}