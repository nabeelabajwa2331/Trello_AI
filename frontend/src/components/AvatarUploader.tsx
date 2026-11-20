import { useRef, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Camera, Trash2 } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { api, errorMessage } from '../lib/api';
import { useStore } from '../store/useStore';
import type { User } from '../types';

const SIZE = 256;

/** Centre-crops the picture to a square and shrinks it to 256x256 JPEG, on the device, before uploading. */
async function toSquareJpeg(file: File): Promise<string> {
  let source: CanvasImageSource;
  let w: number;
  let h: number;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    [source, w, h] = [bmp, bmp.width, bmp.height];
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error('unreadable'));
      img.src = url;
    });
    URL.revokeObjectURL(url);
    [source, w, h] = [img, img.naturalWidth, img.naturalHeight];
  }
  const s = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FAF8F4';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(source, (w - s) / 2, (h - s) / 2, s, s, 0, 0, SIZE, SIZE);
  return canvas.toDataURL('image/jpeg', 0.86);
}

/**
 * Your avatar with a camera button. No photo yet: a camera icon in its place.
 * Choose a picture, see a round preview, then save; or remove the current photo.
 */
export function AvatarUploader({ size = 'lg' }: { size?: 'md' | 'lg' }) {
  const me = useStore((s) => s.users[s.me]);
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);
  if (!me) return null;

  const hasPhoto = !!me.avatarUrl && !broken;
  const box = size === 'lg' ? 'h-20 w-20 text-xl' : 'h-12 w-12 text-sm';
  const save = (user: User) => useStore.setState((s) => ({ users: { ...s.users, [user.id]: { ...s.users[user.id], ...user } } }));

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file (JPG, PNG or WebP).');
    try {
      setPreview(await toSquareJpeg(file));
    } catch {
      toast.error("That picture couldn't be opened. Try a JPG or PNG.");
    }
  };

  return (
    <>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={clsx(
            'group relative grid place-items-center overflow-hidden rounded-full',
            box,
            !hasPhoto && 'border-2 border-dashed border-muted/60 bg-column text-muted hover:border-ink hover:text-ink',
          )}
          aria-label={hasPhoto ? 'Change profile photo' : 'Add a profile photo'}
          title={hasPhoto ? 'Change photo' : 'Add a photo'}
        >
          {hasPhoto ? (
            <>
              <img
                src={me.avatarUrl!}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setBroken(true)}
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 grid place-items-center bg-[#2A2926]/45 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera size={size === 'lg' ? 22 : 16} />
              </span>
            </>
          ) : (
            <Camera size={size === 'lg' ? 26 : 18} />
          )}
        </button>
        {/* small camera badge, always visible, so it's obvious the photo can be changed */}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border-2 border-surface bg-accent text-on-accent shadow-card"
          aria-hidden="true"
          tabIndex={-1}
        >
          <Camera size={14} />
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => (void pick(e.target.files?.[0]), (e.target.value = ''))}
        />
      </div>

      <Dialog open={!!preview} onClose={() => setPreview(null)} title="New profile photo">
        <div className="flex flex-col items-center gap-5 p-5">
          {preview && <img src={preview} alt="Preview" className="h-40 w-40 rounded-full border-2 border-ink object-cover shadow-hard" />}
          <p className="text-center text-sm text-muted">This is how teammates will see you on cards, comments and the activity log.</p>
          <div className="flex w-full flex-wrap justify-between gap-2">
            <button className="btn-ghost" onClick={() => input.current?.click()}>
              Choose another
            </button>
            <div className="flex gap-2">
              <button className="btn-quiet" onClick={() => setPreview(null)}>
                Cancel
              </button>
              <button
                className="btn-cta"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const { user } = await api<{ user: User }>('/auth/avatar', 'PUT', { image: preview });
                    save(user);
                    setBroken(false);
                    setPreview(null);
                    toast('Profile photo updated');
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                  setBusy(false);
                }}
              >
                {busy ? 'Saving…' : 'Save photo'}
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** "Remove photo" link, shown next to the uploader when there is a photo. */
export function RemovePhotoButton() {
  const me = useStore((s) => s.users[s.me]);
  const [busy, setBusy] = useState(false);
  if (!me?.avatarUrl) return null;
  return (
    <button
      type="button"
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-danger"
      onClick={async () => {
        setBusy(true);
        try {
          const { user } = await api<{ user: User }>('/auth/avatar', 'DELETE');
          useStore.setState((s) => ({ users: { ...s.users, [user.id]: { ...s.users[user.id], ...user } } }));
          toast('Profile photo removed');
        } catch (e) {
          toast.error(errorMessage(e));
        }
        setBusy(false);
      }}
    >
      <Trash2 size={12} /> Remove photo
    </button>
  );
}
