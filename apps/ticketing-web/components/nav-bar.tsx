'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

export function NavBar() {
  const router = useRouter();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between p-4">
        <Link href="/" className="text-nbl-orange-600 text-lg font-bold">
          NBL Tickets
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user && user.role !== 'admin' && (
            <Link href="/account" className="hover:text-nbl-orange-600 font-medium">
              My Account
            </Link>
          )}
          {user?.role === 'admin' && (
            <Link href="/admin" className="hover:text-nbl-orange-600 font-medium">
              Admin console
            </Link>
          )}
          {user ? (
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Log out
            </Button>
          ) : (
            <Link href="/login" className="hover:text-nbl-orange-600 font-medium">
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
