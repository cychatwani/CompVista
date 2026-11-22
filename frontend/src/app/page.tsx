import { redirect } from 'next/navigation';

// No public home page (PD-002). /app checks the session server-side and sends anyone
// who is not fully signed in to /login.
export default function Home() {
  redirect('/app');
}
