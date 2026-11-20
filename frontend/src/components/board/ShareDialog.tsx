import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Copy, Link2, Mail, X } from 'lucide-react';
import type { Board, Role } from '../../types';
import { useStore } from '../../store/useStore';
import { can, roleInfo } from '../../lib/permissions';
import { Avatar } from '../ui/Avatar';
import { RoleBadge } from '../ui/Chips';
import { Dialog } from '../ui/Dialog';
import { ago } from '../../lib/dates';

const ROLES: Role[] = ['admin', 'member', 'viewer'];

export function ShareDialog({
  board,
  myRole,
  open,
  onClose,
}: {
  board: Board;
  myRole: Role | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me);
  const invite = useStore((s) => s.invite);
  const revoke = useStore((s) => s.revokeInvite);
  const setRole = useStore((s) => s.setRole);
  const remove = useStore((s) => s.removeMember);
  const createLink = useStore((s) => s.createInviteLink);
  const [email, setEmail] = useState('');
  const [role, setNewRole] = useState<Role>('member');
  const [linkRole, setLinkRole] = useState<Role>('member');
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const canInvite = can(myRole, 'invite');
  const canManage = can(myRole, 'manageMembers');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(v)) return setError('Enter a valid email address.');
    if (board.invites.some((i) => i.email === v) || board.members.some((m) => users[m.userId]?.email === v))
      return setError('That person is already invited or on the board.');
    setError('');
    if (await invite(board.id, v, role)) {
      setEmail('');
      toast(`Invited ${v}. They’ll see it when they log in with that email.`);
    }
  };

  const link = board.inviteLink ? `${location.origin}/join/${board.inviteLink.token}` : '';

  return (
    <Dialog open={open} onClose={onClose} title={`Share “${board.title}”`} width="max-w-lg">
      <div className="flex flex-col gap-6 p-5">
        {canInvite ? (
          <>
            <form onSubmit={submit} className="flex flex-col gap-2">
              <label htmlFor="invite-email" className="text-sm font-semibold">
                Invite by email
              </label>
              <div className="flex flex-wrap gap-2">
                {/* Full width on phones so the address is readable; one row on wider screens */}
                <div className="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="invite-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    className="input pl-9"
                    placeholder="teammate@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <select
                  id="invite-role"
                  aria-label="Role"
                  className="input w-auto flex-1 sm:flex-none"
                  value={role}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleInfo[r].label}
                    </option>
                  ))}
                </select>
                <button className="btn-cta">Invite</button>
              </div>
              {error ? (
                <p className="text-xs font-medium text-danger">{error}</p>
              ) : (
                <p className="text-xs text-muted">{roleInfo[role].hint}.</p>
              )}
            </form>

            <div className="flex flex-col gap-2 rounded-[12px] bg-column p-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Link2 size={15} /> Invite link
              </div>
              {board.inviteLink ? (
                <>
                  <div className="flex gap-2">
                    <input readOnly id="invite-link" className="input font-mono text-xs" value={link} onFocus={(e) => e.target.select()} />
                    <button
                      className="btn-ghost"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(link);
                          toast('Link copied');
                        } catch {
                          (document.getElementById('invite-link') as HTMLInputElement)?.select();
                          toast('Press Ctrl+C to copy');
                        }
                      }}
                    >
                      <Copy size={15} /> Copy
                    </button>
                  </div>
                  <p className="text-xs text-muted">
                    Anyone with this link joins as <b>{board.inviteLink.role}</b>. Expires {board.inviteLink.expiresAt}.
                  </p>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted">Create a link that joins people as</span>
                  <select
                    aria-label="Link role"
                    className="input w-auto py-1.5"
                    value={linkRole}
                    onChange={(e) => setLinkRole(e.target.value as Role)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleInfo[r].label}
                      </option>
                    ))}
                  </select>
                  <button className="btn-primary px-3 py-1.5" onClick={() => createLink(board.id, linkRole)}>
                    Create link
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="rounded-[12px] bg-column p-3.5 text-sm text-muted">
            Only owners and admins can invite people. Ask{' '}
            {users[board.members.find((m) => m.role === 'owner')?.userId ?? '']?.name ?? 'the owner'} to add someone.
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">Members · {board.members.length}</h3>
          <ul className="flex flex-col divide-y divide-line">
            {board.members.map((m) => {
              const u = users[m.userId];
              const editable = canManage && m.userId !== me && m.role !== 'owner';
              return (
                <li key={m.userId} className="flex items-center gap-3 py-2.5">
                  <Avatar userId={m.userId} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {u?.name}
                      {m.userId === me && ' (you)'}
                    </div>
                    <div className="truncate text-xs text-muted">{u?.email || '—'}</div>
                  </div>
                  {confirmRemove === m.userId ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted">Remove?</span>
                      <button
                        className="btn-danger px-2.5 py-1 text-xs"
                        onClick={() => {
                          remove(board.id, m.userId);
                          setConfirmRemove(null);
                          toast(`${u?.name} removed`);
                        }}
                      >
                        Remove
                      </button>
                      <button className="btn-quiet px-2 py-1 text-xs" onClick={() => setConfirmRemove(null)}>
                        Keep
                      </button>
                    </div>
                  ) : editable ? (
                    <div className="flex items-center gap-1">
                      <select
                        aria-label={`Role for ${u?.name}`}
                        className="input w-auto py-1 text-xs"
                        value={m.role}
                        onChange={(e) => setRole(board.id, m.userId, e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleInfo[r].label}
                          </option>
                        ))}
                      </select>
                      <button className="btn-quiet h-8 w-8 p-0" aria-label={`Remove ${u?.name}`} onClick={() => setConfirmRemove(m.userId)}>
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {board.invites.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold">Pending · {board.invites.length}</h3>
            <ul className="flex flex-col divide-y divide-line">
              {board.invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-dashed border-line text-muted">
                    <Mail size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{i.email}</div>
                    <div className="text-xs text-muted">
                      Invited {ago(i.createdAt)} as {i.role}
                    </div>
                  </div>
                  {canInvite && (
                    <div className="flex gap-1">
                      <button className="btn-quiet px-2 py-1 text-xs" onClick={() => toast(`Invite re-sent to ${i.email}`)}>
                        Resend
                      </button>
                      <button className="btn-quiet px-2 py-1 text-xs text-danger" onClick={() => revoke(board.id, i.id)}>
                        Revoke
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
