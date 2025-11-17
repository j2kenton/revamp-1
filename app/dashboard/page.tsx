import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import SignOutButton from './SignOutButton';
import GoHomeButton from './GoHomeButton';
import { STRINGS } from '@/lib/constants/strings';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg bg-white p-8 shadow-lg">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            {STRINGS.dashboard.title}
          </h1>

          <div className="space-y-4 mb-8">
            <div>
              <h2 className="text-xl font-semibold text-gray-700 mb-4">
                {STRINGS.dashboard.userInfo}
              </h2>
              <div className="space-y-2">
                <p className="text-gray-600">
                  <span className="font-medium">{STRINGS.dashboard.labels.id}</span> {session.user.id}
                </p>
                <p className="text-gray-600">
                  <span className="font-medium">{STRINGS.dashboard.labels.email}</span>{' '}
                  {session.user.email}
                </p>
                {session.user.name && (
                  <p className="text-gray-600">
                    <span className="font-medium">{STRINGS.dashboard.labels.name}</span>{' '}
                    {session.user.name}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                {STRINGS.dashboard.sessionStatus}
              </h3>
              <p className="text-green-600 font-medium">{STRINGS.dashboard.authenticated}</p>
            </div>
          </div>

          <div className="flex gap-4">
            <SignOutButton />
            <GoHomeButton />
          </div>
        </div>

        <div className="mt-8 rounded-lg bg-blue-50 p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            {STRINGS.dashboard.successTitle}
          </h3>
          <p className="text-blue-800">
            {STRINGS.dashboard.successDescription}
          </p>
        </div>
      </div>
    </div>
  );
}
