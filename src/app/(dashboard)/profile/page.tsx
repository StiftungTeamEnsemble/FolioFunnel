import { redirect } from 'next/navigation';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { ProfileForm } from '@/components/profile/ProfileForm';

export default async function ProfilePage() {
  const sessionUser = await requireAuth();
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { name: true, email: true },
  });

  if (!user) {
    redirect('/auth/signin');
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Profile</h1>
          <p className="page__subtitle">Update your account details.</p>
        </div>
      </div>
      <ProfileForm name={user.name} email={user.email} />
    </div>
  );
}
