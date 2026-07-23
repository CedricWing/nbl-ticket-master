'use client';

import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getMySeasonStatus } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export function ProfileCard() {
  const { user, initialized } = useAuth();
  const { data: seasonStatus } = useSWR(
    user ? ['season-status', user.id] : null,
    () => getMySeasonStatus(),
    { shouldRetryOnError: false },
  );

  if (!initialized || !user) return null;

  return (
    <Card className="mb-6">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="font-semibold">{user.name}</p>
          <p className="text-muted-foreground text-xs">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {user.role === 'admin' && <Badge variant="secondary">Admin</Badge>}
          {seasonStatus?.isSeasonHolder && (
            <Badge className="bg-nbl-orange-500">
              Season pass{seasonStatus.teams.length > 0 ? ` · ${seasonStatus.teams.join(', ')}` : ''}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
