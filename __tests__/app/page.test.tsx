import HomePage from '@/app/page';
import { redirect } from 'next/navigation';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('Home page', () => {
  it('redirects to the login route', () => {
    HomePage();
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
