import Link from 'next/link';
import { CreateGame } from '@/components/CreateGame';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Home Game Poker</h1>
        <p className="mt-2 text-sm opacity-70">
          Texas Hold&apos;em with friends — share a link, take a seat.
        </p>
        <p className="mt-1 text-xs opacity-50">Play money only — chips have no cash value.</p>
      </div>
      <CreateGame />
      <footer className="text-center text-xs opacity-50">
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
      </footer>
    </main>
  );
}
