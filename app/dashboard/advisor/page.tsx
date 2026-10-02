'use client';

import { AlertTriangle, Info, MessageSquareText, TriangleAlert, Users } from 'lucide-react';
import { Badge, Button, Card, CardHeader, PageHeader, StatCard, table } from '../../components/ui';

// Preview only — not connected to live records yet (waiting on the advisor assignments).
const SAMPLE = [
  { id: '014', name: 'Student M', sem: 3, attendance: 92, cgpa: '3.75', backlogs: 0, risk: 'Normal' as const },
  { id: '042', name: 'Student X', sem: 5, attendance: 70, cgpa: '2.80', backlogs: 1, risk: 'Medium' as const },
  { id: '088', name: 'Student Z', sem: 3, attendance: 55, cgpa: '2.10', backlogs: 3, risk: 'High' as const },
];
const RISK_TONE = { Normal: 'emerald', Medium: 'amber', High: 'rose' } as const;

export default function AdvisorDashboard() {
  return (
    <>
      <PageHeader title="Student Advisor Portal" description="Track your advisees and escalate students who need help." />

      <div className="mb-6 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Preview only — the numbers and students below are sample data. This portal will be connected to live records once advisors are assigned.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Advisees" value="60" hint="Assigned cohort" icon={Users} tone="indigo" />
        <StatCard label="High risk" value="3" hint="Needs intervention" icon={AlertTriangle} tone="rose" />
        <StatCard label="Backlog alerts" value="8" hint="Failed or pending courses" icon={TriangleAlert} tone="amber" />
        <StatCard label="Consultations" value="12" hint="Logged this month" icon={MessageSquareText} tone="sky" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="My advisees" icon={Users} actions={<Button size="sm" variant="secondary" disabled>Log counselling session</Button>} />
        <div className={table.wrap}>
          <table className={table.table}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Student</th>
                <th className={`${table.th} text-center`}>Attendance</th>
                <th className={`${table.th} text-center`}>CGPA</th>
                <th className={`${table.th} text-center`}>Backlogs</th>
                <th className={table.th}>Risk</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {SAMPLE.map((s) => (
                <tr key={s.id} className={table.row}>
                  <td className={table.td}><p className="font-medium text-slate-900">{s.name}</p><p className="text-xs text-slate-500">{s.id} · Sem {s.sem}</p></td>
                  <td className={`${table.td} text-center`}><Badge tone={s.attendance < 60 ? 'rose' : s.attendance < 75 ? 'amber' : 'emerald'}>{s.attendance}%</Badge></td>
                  <td className={`${table.td} text-center tabular-nums`}>{s.cgpa}</td>
                  <td className={`${table.td} text-center tabular-nums`}>{s.backlogs}</td>
                  <td className={table.td}><Badge tone={RISK_TONE[s.risk]} dot>{s.risk}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
