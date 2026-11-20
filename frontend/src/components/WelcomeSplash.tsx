import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { firstName } from '../lib/id';

const INK = '#2A2926';
const YELLOW = '#F4C430';
const SOFT = '#FAEBB5';
const CHEEK = '#E8836B';

/** Thick cartoon arm: a dark outline with the yellow body colour on top. */
function Arm({ d }: { d: string }) {
  return (
    <>
      <path d={d} stroke={INK} strokeWidth={18} strokeLinecap="round" fill="none" />
      <path d={d} stroke={YELLOW} strokeWidth={10} strokeLinecap="round" fill="none" />
    </>
  );
}

/** "Crewbie": the Crewboard mascot, giving you a high five. */
function HighFive() {
  return (
    <svg viewBox="0 0 320 240" className="h-auto w-[min(320px,80vw)]" role="img" aria-label="A happy yellow character gives you a high five">
      <ellipse cx="130" cy="224" rx="64" ry="8" fill={INK} opacity="0.12" />
      <g className="cb-bob">
        <Arm d="M76 152 C56 160 50 178 58 192" />
        <path d="M124 74 C118 56 132 48 137 60 C142 48 156 56 148 74" fill={YELLOW} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        <rect x="70" y="72" width="120" height="142" rx="54" fill={YELLOW} stroke={INK} strokeWidth="5" />
        <circle cx="108" cy="128" r="8" fill={INK} />
        <circle cx="152" cy="128" r="8" fill={INK} />
        <circle cx="110.5" cy="125" r="2.6" fill="#fff" />
        <circle cx="154.5" cy="125" r="2.6" fill="#fff" />
        <ellipse cx="96" cy="150" rx="9" ry="5.5" fill={CHEEK} opacity="0.55" />
        <ellipse cx="164" cy="150" rx="9" ry="5.5" fill={CHEEK} opacity="0.55" />
        <path d="M113 150 Q130 174 147 150 Z" fill={INK} />
        <path d="M120 158 Q130 167 140 158 Q130 162 120 158 Z" fill={CHEEK} />
        <ellipse cx="106" cy="216" rx="17" ry="7" fill={INK} />
        <ellipse cx="154" cy="216" rx="17" ry="7" fill={INK} />
        {/* raised arm: taps forward when the hands meet */}
        <g className="cb-hi5-arm">
          <Arm d="M184 142 C206 130 216 112 220 90" />
          <circle cx="222" cy="78" r="17" fill={YELLOW} stroke={INK} strokeWidth="4" />
          <path d="M213 69 L210 59 M221 65 L221 54 M229 67 L232 57" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        </g>
      </g>
      {/* your hand, sliding in from the right */}
      <g className="cb-hi5-you">
        <rect x="262" y="92" width="80" height="24" rx="11" fill={SOFT} stroke={INK} strokeWidth="4" />
        <rect x="244" y="56" width="38" height="48" rx="15" fill={SOFT} stroke={INK} strokeWidth="4" />
        <rect x="246" y="40" width="9" height="24" rx="4.5" fill={SOFT} stroke={INK} strokeWidth="3.5" />
        <rect x="256" y="34" width="9" height="28" rx="4.5" fill={SOFT} stroke={INK} strokeWidth="3.5" />
        <rect x="266" y="36" width="9" height="27" rx="4.5" fill={SOFT} stroke={INK} strokeWidth="3.5" />
        <rect x="276" y="44" width="8" height="22" rx="4" fill={SOFT} stroke={INK} strokeWidth="3.5" />
      </g>
      {/* the "clap" */}
      <g className="cb-burst" stroke={INK} strokeWidth="4" strokeLinecap="round">
        <path d="M236 40 L232 26 M246 42 L252 28 M226 50 L214 42 M252 52 L266 46" />
        <path d="M236 22 l3 6 6 1 -4.5 4 1 6 -5.5 -3 -5.5 3 1 -6 -4.5 -4 6 -1 z" fill={YELLOW} strokeWidth="2.5" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** The boss: crown, sunglasses, red tie, waving. */
function Boss() {
  return (
    <svg viewBox="0 0 300 250" className="h-auto w-[min(300px,78vw)]" role="img" aria-label="A boss character in sunglasses and a crown waves at you">
      <ellipse cx="140" cy="236" rx="66" ry="8" fill={INK} opacity="0.12" />
      <g className="cb-bob">
        <Arm d="M84 166 C62 172 56 190 64 204" />
        {/* crown */}
        <path d="M104 78 L106 46 L124 64 L140 38 L156 64 L174 46 L176 78 Z" fill={YELLOW} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        <circle cx="140" cy="38" r="5" fill="#B8443A" stroke={INK} strokeWidth="2.5" />
        <circle cx="106" cy="46" r="4" fill={SOFT} stroke={INK} strokeWidth="2.5" />
        <circle cx="174" cy="46" r="4" fill={SOFT} stroke={INK} strokeWidth="2.5" />
        {/* body */}
        <rect x="80" y="76" width="120" height="150" rx="54" fill={YELLOW} stroke={INK} strokeWidth="5" />
        {/* sunglasses */}
        <path d="M98 122 L182 122" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        <rect x="100" y="116" width="34" height="22" rx="9" fill={INK} />
        <rect x="146" y="116" width="34" height="22" rx="9" fill={INK} />
        <path d="M106 121 L114 121" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
        <path d="M152 121 L160 121" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
        {/* confident smirk */}
        <path d="M124 160 Q142 170 158 156" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
        <ellipse cx="104" cy="154" rx="9" ry="5" fill={CHEEK} opacity="0.5" />
        <ellipse cx="176" cy="154" rx="9" ry="5" fill={CHEEK} opacity="0.5" />
        {/* collar and tie */}
        <path d="M122 182 L140 192 L158 182" stroke={INK} strokeWidth="4" fill="none" strokeLinejoin="round" />
        <path d="M134 190 L146 190 L143 198 L150 222 L140 232 L130 222 L137 198 Z" fill="#B8443A" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        <ellipse cx="116" cy="228" rx="17" ry="7" fill={INK} />
        <ellipse cx="164" cy="228" rx="17" ry="7" fill={INK} />
        {/* waving arm */}
        <g className="cb-wave-arm">
          <Arm d="M194 152 C216 140 226 120 230 98" />
          <circle cx="232" cy="86" r="17" fill={YELLOW} stroke={INK} strokeWidth="4" />
          <path d="M223 77 L220 67 M231 73 L231 62 M239 75 L242 65" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path d="M254 70 Q262 80 254 92 M262 64 Q274 80 262 98" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.6" />
        </g>
      </g>
    </svg>
  );
}

/**
 * Shown once, right after logging in or signing up (never on a reload).
 * Closes by itself, or with a tap / Esc, and the boards are behind it.
 */
export function WelcomeSplash() {
  const welcome = useStore((s) => s.welcome);
  const name = useStore((s) => s.users[s.me]?.name ?? '');
  const dismiss = useStore((s) => s.dismissWelcome);
  const navigate = useNavigate();

  useEffect(() => {
    if (!welcome) return;
    const t = setTimeout(dismiss, welcome === 'admin' ? 5000 : 3400);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [welcome, dismiss]);

  if (!welcome) return null;
  const first = firstName(name);
  const isAdmin = welcome === 'admin';

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-bg/95 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label={isAdmin ? 'Welcome, Admin' : 'Welcome'}
      onClick={dismiss}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center" onClick={(e) => e.stopPropagation()}>
        {isAdmin ? <Boss /> : <HighFive />}

        <div className="flex flex-col gap-2">
          <span className="self-center rounded-full border border-ink bg-accent px-3 py-1 text-sm font-semibold text-on-accent">
            {isAdmin ? 'Boss mode on 😎' : 'High five! ✋'}
          </span>
          <h1 className="font-wide text-[clamp(1.8rem,7vw,2.6rem)] font-extrabold leading-tight tracking-tight">
            {isAdmin ? 'Welcome, Admin!' : welcome === 'new' ? `Welcome to Crewboard, ${first}!` : `Welcome back, ${first}!`}
          </h1>
          <p className="text-muted">
            {isAdmin
              ? 'Everything is running. Your boards and the admin panel are ready when you are.'
              : welcome === 'new'
                ? 'Glad you’re here. Let’s get your group project out of the group chat.'
                : 'Your boards are right where you left them.'}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {isAdmin && (
            <button
              className="btn-primary px-5 py-2.5"
              onClick={() => {
                dismiss();
                navigate('/admin');
              }}
            >
              Open admin panel
            </button>
          )}
          <button className="btn-cta px-5 py-2.5" onClick={dismiss} autoFocus>
            {isAdmin ? 'Go to my boards' : 'Let’s go →'}
          </button>
        </div>
      </div>
    </div>
  );
}
