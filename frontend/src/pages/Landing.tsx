import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, Check, Menu, MessageSquare, Minus, X } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { LabelChip } from '../components/ui/Chips';
import { DemoBoard } from './landing/DemoBoard';
import { useStore } from '../store/useStore';

const wrap = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
const h2 = 'font-display font-wide text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[1.02] tracking-[-0.02em]';

export default function Landing() {
  const session = useStore((s) => s.status === 'ready');
  const [menu, setMenu] = useState(false);
  const startHref = session ? '/boards' : '/signup';
  const links: [string, string][] = [
    ['How a project goes', '#weeks'],
    ['Try it', '#try'],
    ['Roles', '#roles'],
    ['FAQ', '#faq'],
  ];

  return (
    <div className="min-h-screen bg-bg text-[15px]">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg">
        <nav className={clsx(wrap, 'flex h-16 items-center gap-8')}>
          <Logo />
          <div className="hidden items-center gap-6 text-sm md:flex">
            {links.map(([l, h]) => (
              <a key={h} href={h} className="text-muted underline-offset-4 hover:text-ink hover:underline">{l}</a>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {!session && <Link to="/login" className="btn-quiet hidden sm:inline-flex">Log in</Link>}
            <Link to={startHref} className="btn-cta hidden sm:inline-flex">{session ? 'Open your boards' : 'Start a board'}</Link>
            <button className="btn-quiet h-9 w-9 p-0 md:hidden" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </nav>
        {menu && (
          <div className={clsx(wrap, 'flex flex-col gap-1 pb-4 md:hidden')}>
            {links.map(([l, h]) => (
              <a key={h} href={h} onClick={() => setMenu(false)} className="rounded-md px-2 py-2 hover:bg-column">{l}</a>
            ))}
            <div className="mt-2 flex gap-2">
              {!session && <Link to="/login" className="btn-ghost flex-1">Log in</Link>}
              <Link to={startHref} className="btn-cta flex-1">Start a board</Link>
            </div>
          </div>
        )}
      </header>

      {/* ---------- Hero ---------- */}
      <section className={clsx(wrap, 'grid gap-12 pb-20 pt-14 lg:grid-cols-[1.25fr_1fr] lg:gap-16 lg:pt-20')}>
        <div className="flex flex-col gap-7">
          <p className="font-mono text-xs text-muted">Group chat · Thursday, 11:48 pm · report due Friday, 9:00 am</p>
          <h1 className="font-wide text-[clamp(2.8rem,8.5vw,6.6rem)] font-black leading-[0.98] tracking-[-0.035em] sm:leading-[0.9]">
            Who’s doing{' '}
            <span className="whitespace-nowrap">
              the{' '}
              {/* Highlighter stroke through the middle of the word, so it never covers the line above */}
              <mark className="bg-transparent bg-[linear-gradient(transparent_22%,rgb(var(--accent))_22%,rgb(var(--accent))_90%,transparent_90%)] px-[0.08em] text-on-accent [box-decoration-break:clone]">
                slides?
              </mark>
            </span>
          </h1>
          <p className="max-w-[50ch] text-lg leading-relaxed text-muted">
            Every group project asks this at least once, usually the night before. Crewboard puts each task on a card with a name and a
            date, so the answer is on the board before anyone has to ask.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link to={startHref} className="btn-cta px-5 py-3 text-[15px]">
              Start a board, it’s free <ArrowRight size={17} />
            </Link>
            <a href="#try" className="font-semibold underline decoration-accent decoration-[3px] underline-offset-[6px] hover:decoration-ink">
              or drag some cards first
            </a>
          </div>
        </div>

        {/* The question, and the answer */}
        <div className="relative flex flex-col justify-center gap-5 lg:pt-6" aria-label="A chat question answered by a Crewboard card">
          <div className="flex max-w-[300px] flex-col gap-1 rounded-2xl rounded-bl-sm bg-surface px-4 py-3 shadow-card">
            <span className="text-xs font-semibold text-[#A8574A]">Sara</span>
            <span>wait who’s doing the slides??</span>
            <span className="self-end font-mono text-[10px] text-muted">11:48 pm · seen by 4</span>
          </div>
          <div className="flex max-w-[240px] flex-col gap-1 self-start rounded-2xl rounded-bl-sm bg-surface px-4 py-3 opacity-70 shadow-card">
            <span className="text-xs font-semibold text-[#5E7D57]">Hamza</span>
            <span>not me I did the survey</span>
          </div>

          <svg viewBox="0 0 120 60" className="ml-24 h-12 w-28 text-muted" aria-hidden="true">
            <path d="M5 5 C 20 50, 70 55, 110 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="4 4" />
            <path d="M100 33 L111 40 L99 46" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>

          <div className="relative ml-auto w-full max-w-[340px]">
            <div className="flex flex-col gap-2.5 rounded-card border border-ink bg-surface p-4 shadow-hard">
              <LabelChip id="slides" className="self-start" />
              <span className="text-[17px] font-semibold">Presentation slides</span>
              <div className="flex items-center justify-between">
                <span className="rounded bg-column px-1.5 py-px font-mono text-xs text-muted">Due Fri</span>
                <span className="flex items-center gap-2 text-sm">
                  Sara <span className="grid h-6 w-6 place-items-center rounded-full bg-[#A8574A] text-[10px] font-semibold text-white">SR</span>
                </span>
              </div>
              <span className="border-t border-line pt-2 font-mono text-[11px] text-muted">Assigned on Monday · in Doing</span>
            </div>
            <p className="absolute -right-2 -top-10 rotate-[-4deg] font-hand text-[22px] leading-none text-ink sm:-right-6">
              answered on Monday
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Week by week ---------- */}
      <section id="weeks" className="scroll-mt-16 border-y border-ink bg-surface">
        <div className={clsx(wrap, 'flex flex-col gap-10 py-20')}>
          <div className="grid gap-4 md:grid-cols-[1fr_1fr] md:items-end">
            <h2 className={h2}>How a six-week group project usually goes</h2>
            <p className="max-w-[46ch] text-muted md:justify-self-end">
              The same project twice: once run from a group chat, once from a board. The work is the same. What changes is how much you
              have to remember.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="w-40 border-b border-ink pb-3" />
                  {WEEKS.map((w, i) => (
                    <th key={i} className="border-b border-ink pb-3 pr-4 align-bottom">
                      <span className="font-mono text-xs font-normal text-muted">Week {i + 1}</span>
                      <span className="block font-display text-base font-bold">{w.phase}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="border-b border-line py-4 pr-4 align-top font-semibold text-muted">In the group chat</th>
                  {WEEKS.map((w, i) => (
                    <td key={i} className="border-b border-line py-4 pr-4 align-top text-muted">
                      <span className="inline-block rounded-xl rounded-bl-sm bg-bg px-3 py-2">{w.chat}</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="py-4 pr-4 align-top font-semibold">On Crewboard</th>
                  {WEEKS.map((w, i) => (
                    <td key={i} className="py-4 pr-4 align-top">
                      <span className={clsx('inline-block rounded-card border px-3 py-2', i === WEEKS.length - 1 ? 'border-ink bg-accent text-on-accent' : 'border-line bg-surface')}>{w.board}</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---------- Try it ---------- */}
      <section id="try" className={clsx(wrap, 'grid scroll-mt-16 gap-10 py-24 lg:grid-cols-[1fr_2fr]')}>
        <div className="flex flex-col gap-5">
          <h2 className={h2}>This board works. Drag a card to Done.</h2>
          <p className="text-muted">
            It’s the same board you get after signing up, minus the saving. Cards turn amber the day before they’re due and red when they’re late.
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {['Drag with a mouse, or press and hold with a finger', 'Use Tab, Space and the arrow keys', 'Reorder inside a list or move between lists'].map((t) => (
              <li key={t} className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-success" strokeWidth={3} /> {t}</li>
            ))}
          </ul>
        </div>
        <DemoBoard />
      </section>

      {/* ---------- Anatomy of a card ---------- */}
      <section className="ruled border-y border-line bg-surface">
        <div className={clsx(wrap, 'grid items-center gap-12 py-24 md:grid-cols-2')}>
          <div className="relative mx-auto w-full max-w-[380px]">
            <div className="flex flex-col gap-3 rounded-card border border-ink bg-surface p-5 shadow-hard">
              <div className="flex items-center gap-2"><Num n={1} /><LabelChip id="research" /><LabelChip id="urgent" /></div>
              <div className="flex items-start gap-2"><Num n={2} /><span className="text-lg font-semibold leading-snug">Find 8 sources for the literature review</span></div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-2"><Num n={3} /><span className="rounded bg-soon px-1.5 py-0.5 font-mono text-xs text-soon-fg">Due tomorrow</span></span>
                <span className="flex items-center gap-2"><Num n={4} /><span className="inline-flex items-center gap-1 font-mono text-xs text-muted"><MessageSquare size={13} /> 3</span></span>
                <span className="ml-auto flex items-center gap-2"><Num n={5} />
                  <span className="flex -space-x-1.5">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#4F6C86] text-[10px] font-semibold text-white ring-2 ring-surface">AK</span>
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[10px] font-semibold text-surface ring-2 ring-surface">You</span>
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <h2 className={h2}>Everything about a task, on one card</h2>
            <ol className="flex flex-col gap-4">
              {[
                ['Labels', 'Eight fixed colours, so the board stays readable. Filter by any of them.'],
                ['The task', 'Click to open it. Add a description, links, and what “done” means.'],
                ['Due date', 'Gray when there’s time, amber the day before, red when it’s late.'],
                ['Comments', 'Talk about the task on the task. Type @ to pull someone in. They get notified.'],
                ['Who’s on it', 'One or more people. “My cards” shows only yours.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <Num n={i + 1} />
                  <span><b className="font-semibold">{t}.</b> <span className="text-muted">{d}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---------- Live ---------- */}
      <section className={clsx(wrap, 'flex flex-col gap-10 py-24')}>
        <div className="grid gap-4 md:grid-cols-2 md:items-end">
          <h2 className={h2}>Sara drags it on her laptop. It moves on yours.</h2>
          <p className="max-w-[46ch] text-muted md:justify-self-end">
            Changes reach everyone on the board in about a second. No refreshing, no “did you see my message?”. The activity log keeps a record of who did what.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {[
            { who: "Sara's laptop", note: 'drops “Presentation slides” into Done' },
            { who: 'Your laptop, same second', note: 'Sara moved “Presentation slides” to Done' },
          ].map((s, i) => (
            <figure key={s.who} className="flex flex-col overflow-hidden rounded-modal border border-line bg-surface">
              <figcaption className="flex items-center justify-between border-b border-line bg-column px-4 py-2 font-mono text-xs text-muted">
                {s.who}
                {i === 1 && <span className="flex items-center gap-1.5 text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" /> live</span>}
              </figcaption>
              <div className="grid grid-cols-2 gap-2.5 p-4">
                <div className="rounded-col bg-column p-2.5">
                  <div className="px-1 pb-2 text-xs font-semibold">Doing</div>
                  <div className="rounded-card border border-line bg-surface p-2.5 text-sm">Practice run</div>
                </div>
                <div className="rounded-col bg-column p-2.5">
                  <div className="px-1 pb-2 text-xs font-semibold">Done</div>
                  <div className={clsx('rounded-card border p-2.5 text-sm', i === 1 ? 'border-ink bg-accent-soft' : 'border-ink bg-surface')}>Presentation slides</div>
                </div>
              </div>
              <div className="border-t border-line px-4 py-2.5 text-sm text-muted">{i === 0 ? <>Sara <b className="text-ink">{s.note}</b></> : s.note}</div>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- Roles ---------- */}
      <section id="roles" className="scroll-mt-16 border-y border-ink bg-ink text-surface">
        <div className={clsx(wrap, 'flex flex-col gap-10 py-24')}>
          <div className="grid gap-4 md:grid-cols-2 md:items-end">
            <h2 className={clsx(h2, 'text-surface')}>Four roles. Your mentor gets the one that can’t break anything.</h2>
            <p className="max-w-[46ch] text-surface/70 md:justify-self-end">Boards are private to the people you invite. Pick a role for each person when you invite them, and change it later.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r) => (
              <div key={r.name} className="flex flex-col rounded-modal bg-surface text-ink">
                <div className="flex justify-center pt-3"><span className="h-2 w-12 rounded-full bg-column" aria-hidden="true" /></div>
                <div className="flex flex-col gap-1 px-5 pb-4 pt-4">
                  <span className={clsx('self-start rounded px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider', r.name === 'Viewer' ? 'bg-accent text-on-accent' : 'bg-column text-muted')}>{r.name}</span>
                  <span className="pt-2 font-display text-xl font-bold leading-tight">{r.who}</span>
                </div>
                <ul className="mt-auto flex flex-col gap-1.5 border-t border-dashed border-line px-5 py-4 text-sm">
                  {r.can.map(([ok, t]) => (
                    <li key={t} className={clsx('flex items-start gap-2', !ok && 'text-muted')}>
                      {ok ? <Check size={15} className="mt-0.5 shrink-0 text-success" strokeWidth={3} /> : <Minus size={15} className="mt-0.5 shrink-0" />}
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className={clsx(wrap, 'flex scroll-mt-16 flex-col gap-10 py-24')}>
        <h2 className={h2}>Questions people ask</h2>
        <dl className="grid gap-x-12 gap-y-8 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q} className="flex flex-col gap-2 border-t border-ink pt-4">
              <dt className="font-semibold">{q}</dt>
              <dd className="text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="border-t border-ink bg-accent text-on-accent">
        <div className={clsx(wrap, 'flex flex-col items-start gap-8 py-16 md:flex-row md:items-end md:justify-between')}>
          <p className="font-wide max-w-3xl font-display text-[clamp(1.8rem,4vw,3rem)] font-extrabold leading-[1.02] tracking-[-0.02em]">
            The deadline is still Friday. At least now everyone knows who’s doing what.
          </p>
          <Link to={startHref} className="btn shrink-0 bg-[#2A2926] px-6 py-3 text-[15px] text-[#FAF8F4] hover:bg-[#2A2926]/85">
            Start a board <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <footer className="bg-bg">
        <div className={clsx(wrap, 'flex flex-col gap-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between')}>
          <Logo />
          <div className="flex flex-wrap gap-5">
            <a href="#try" className="hover:text-ink">Try it</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
            <Link to="/login" className="hover:text-ink">Log in</Link>
          </div>
          <span>© {new Date().getFullYear()} Crewboard</span>
        </div>
      </footer>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink font-mono text-[10px] font-medium text-surface">{n}</span>;
}

const WEEKS = [
  { phase: 'Kick-off', chat: '“let’s all just do a bit each”', board: '14 cards, each with one name on it' },
  { phase: 'Research', chat: '“does anyone have the survey link?”', board: 'Link is in the card description' },
  { phase: 'Drafting', chat: '“I thought Omar was doing the intro”', board: 'Intro: Omar, in Doing since Tuesday' },
  { phase: 'Review', chat: '42 unread messages, 3 versions of the doc', board: 'Comments sit on the section they’re about' },
  { phase: 'Crunch', chat: '“why is nobody answering”', board: 'Conclusion turned amber 24 hours early' },
  { phase: 'Deadline', chat: 'All-nighter, submitted 8:57 am', board: 'Last card moved to Done on Thursday, 4 pm' },
];

const ROLES: { name: string; who: string; can: [boolean, string][] }[] = [
  { name: 'Owner', who: 'Whoever made the board', can: [[true, 'Everything'], [true, 'Delete the board'], [true, 'Remove anyone from the board']] },
  { name: 'Admin', who: 'The team lead', can: [[true, 'Edit, move, comment'], [true, 'Invite people, change roles'], [false, 'Delete the board']] },
  { name: 'Member', who: 'Everyone doing the work', can: [[true, 'Edit, move, comment'], [false, 'Invite people'], [false, 'Change roles']] },
  { name: 'Viewer', who: 'Your teacher or mentor', can: [[true, 'See every card and the activity log'], [false, 'Edit or comment'], [false, 'Invite people']] },
];

const FAQ: [string, string][] = [
  ['Is it free?', 'Yes. Boards, cards and teammates are free.'],
  ['Can my teacher see our progress?', 'Invite them as a Viewer. They see every card and the activity log, and can’t change anything.'],
  ['Does it work on my phone?', 'Yes. The board scrolls sideways and you drag cards with your finger.'],
  ['What if two of us move the same card?', 'Each change is saved in order and shows up for everyone straight away. If a save fails, the card goes back and you get a message.'],
  ['Can I undo a mistake?', 'Archived cards stay in the board’s Archive, where you can restore them. The activity log shows who moved, added, assigned or archived each card.'],
  ['Do my teammates need an account?', 'Yes, a free one. Send them an invite link and they land on your board after signing up.'],
];
