import { Link } from 'react-router-dom';
import { LogoMark } from '../components/ui/Logo';

export default function NotFound({ message = "This page doesn't exist, or you don't have access to it." }: { message?: string }) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-4 text-center">
      <div className="flex max-w-sm flex-col items-center gap-4">
        <LogoMark className="h-10 w-10" />
        <h1 className="text-2xl font-extrabold">Nothing here</h1>
        <p className="text-muted">{message}</p>
        <Link to="/boards" className="btn-primary">
          Go to your boards
        </Link>
      </div>
    </div>
  );
}
