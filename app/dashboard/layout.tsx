'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname(); 
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // 1. Check for persistent login in device memory
    const session = localStorage.getItem('faculty_user');
    
    if (!session) {
      router.replace('/login'); // Kicks them out instantly
      return;
    }

    const user = JSON.parse(session);

    // 2. Strict Link Protection
    if (pathname.includes('/student-affairs') || pathname.includes('/studAff')) {
      if (user.role !== 'finance' && user.role !== 'hod') {
        router.replace('/login');
        return;
      }
    }

    if (pathname.includes('/academic')) {
      if (user.role !== 'academic' && user.role !== 'hod') {
        router.replace('/login');
        return;
      }
    }

    // 3. User is safe and verified
    setIsAuthorized(true);
  }, [pathname, router]); 

  // Do not show a single pixel of the dashboard until verified
  if (!isAuthorized) return null; 

  return <section>{children}</section>;
}