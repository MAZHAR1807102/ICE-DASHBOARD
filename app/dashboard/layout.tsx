// Access to /dashboard/* is checked on the server in proxy.ts before this renders,
// and every query is filtered by the database's Row Level Security policies.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
