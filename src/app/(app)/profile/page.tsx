import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROLE_LABELS } from '@/lib/constants';
import { requireUser } from '@/lib/dal';
import { isSupplyTeam } from '@/lib/permissions';
import { getOwnProfile } from '@/server/users';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getOwnProfile(user.id);
  const supply = isSupplyTeam(user.team);

  return (
    <div className="mx-auto grid w-full max-w-xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account details. Name, team and role are set by an admin.</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
          {[
            ['Name', user.name],
            ['Username', user.username ?? '—'],
            ['Team', user.team ?? '—'],
            ['Role', ROLE_LABELS[user.role]],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-muted-foreground">{k}</div>
              <div className="font-medium">{v}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            {supply
              ? profile?.email
                ? 'You’re in the Supply team, so you get an email for every new critical case.'
                : 'You’re in the Supply team: add your email to get an alert for every new critical case.'
              : 'Saved on your profile. New-case alerts go to the Supply team.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm email={profile?.email ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
