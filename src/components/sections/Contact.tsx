'use client';

import { useMemo, useState } from 'react';
import { Check, ArrowUpRight } from 'lucide-react';
import { contact, hasEmail, site } from '@/content/content';
import { useTypewriter } from '@/hooks/useTypewriter';
import SectionHeading from '@/components/ui/SectionHeading';
import MagneticButton from '@/components/ui/MagneticButton';

const SERVICES = [
  'DISCORD BOT',
  'AI AGENT',
  'WEB APP',
  'AUTOMATION',
  'API / BACKEND',
  'OTHER',
] as const;

/**
 * Contact: multi-select service pills feeding a live status banner, then a form.
 *
 * There is no backend — the site is a static export. Two routes out, picked from
 * the content file:
 *
 * - an email address is set → the form composes a `mailto:` with the selected
 *   services and the message pre-filled and hands off to the mail client;
 * - no address → the brief is copied to the clipboard and the Discord invite
 *   opens, so the visitor only has to paste.
 *
 * Either way nothing is stored and nothing is hosted. To switch to a real
 * endpoint later, point the form's `action` at it and drop `onSubmit`.
 */
export default function Contact() {
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const { displayed, done } = useTypewriter("LET'S BUILD\nSOMETHING SOLID.", 38, 600);

  const toggle = (service: string) =>
    setSelected((cur) =>
      cur.includes(service) ? cur.filter((s) => s !== service) : [...cur, service],
    );

  const ready = selected.length > 0;

  const subject = selected.length
    ? `New enquiry — ${selected.join(', ')}`
    : 'New enquiry from your portfolio';

  const brief = useMemo(
    () =>
      [
        name && `Name: ${name}`,
        from && `Reply to: ${from}`,
        selected.length && `Interested in: ${selected.join(', ')}`,
        '',
        message,
      ]
        .filter(Boolean)
        .join('\n'),
    [selected, name, from, message],
  );

  const mailto = `mailto:${contact.email}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(brief)}`;

  const send = async () => {
    if (hasEmail) {
      window.location.href = mailto;
      return;
    }

    try {
      await navigator.clipboard.writeText(`${subject}\n\n${brief}`);
      setCopied(true);
    } catch {
      /* Clipboard refused (no permission, or no secure context) — open anyway. */
    }

    window.open(contact.discordInvite, '_blank', 'noopener,noreferrer');
  };

  return (
    <section id="contact" className="relative z-10 border-t border-rule bg-ground/92">
      <div className="px-5 py-20 sm:px-8 sm:py-28">
        <SectionHeading
          index="07"
          label="Contact"
          title="TALK"
          aside={site.available ? 'AVAILABLE NOW' : 'BOOKED — STILL WRITE'}
        />

        <div className="mt-14 grid gap-16 lg:grid-cols-[1fr_1fr] lg:gap-20">
          {/* Left: typed headline, pills, status banner */}
          <div>
            <h3 className="font-display whitespace-pre-wrap text-[10vw] leading-[0.88] sm:text-[4.6vw]">
              {displayed}
              {!done && (
                <span className="animate-blink ml-[3px] inline-block h-[0.85em] w-[4px] translate-y-[-2px] bg-ink align-middle" />
              )}
            </h3>

            <p className="mt-6 max-w-[46ch] text-sm leading-relaxed text-ink-dim sm:text-base">
              Tell me what you are building. Pick the parts you need help with — it saves a round
              trip, and I will reply with a straight answer on scope and timing.
            </p>

            {/* Service pills — multi-select, no radio semantics. */}
            <div className="mt-10">
              <p className="label mb-4">WHAT DO YOU NEED?</p>
              <div className="flex flex-wrap gap-2">
                {SERVICES.map((service) => {
                  const active = selected.includes(service);
                  return (
                    <button
                      key={service}
                      type="button"
                      onClick={() => toggle(service)}
                      aria-pressed={active}
                      data-cursor={active ? 'DROP' : 'PICK'}
                      className={`label flex items-center border px-4 py-3 transition-colors duration-200 ${
                        active
                          ? 'border-ink bg-ink text-ground'
                          : 'border-rule text-ink-dim hover:border-ink hover:text-ink'
                      }`}
                    >
                      {/* Kept mounted and collapsed to zero width — a CSS width/opacity
                          transition gives both the enter and the exit for free, where a
                          JS presence animation would cost a library on the critical path.
                          The margin animates with it so inactive pills keep their tight
                          padding instead of reserving a gap for an absent tick. */}
                      <span
                        aria-hidden
                        className={`inline-flex shrink-0 items-center overflow-hidden transition-all duration-200 ${
                          active ? 'mr-2 w-3 opacity-100' : 'mr-0 w-0 opacity-0'
                        }`}
                      >
                        <Check size={12} strokeWidth={3} className="shrink-0" />
                      </span>
                      {service}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status banner — both states stacked in one grid cell so the container
                is as tall as the taller of them and neither is absolutely positioned.
                Cross-fading in CSS keeps the exit animation without a presence
                library; `inert` keeps the hidden banner's button out of the tab
                order and off screen readers. */}
            <div className="mt-8 grid min-h-[74px]">
              <div
                inert={!ready}
                className={`col-start-1 row-start-1 flex flex-wrap items-center justify-between gap-4 border border-rule bg-ground-2 px-5 py-4 transition-[opacity,transform] duration-300 ${
                  ready ? 'opacity-100' : '-translate-y-2 opacity-0'
                }`}
              >
                <p className="label max-w-[42ch] text-ink">
                  READY TO TALK ABOUT: {selected.join(' · ')}
                </p>
                <button
                  type="button"
                  onClick={send}
                  data-cursor="SEND"
                  className="label flex items-center gap-1 text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
                >
                  LET&apos;S GO
                  <ArrowUpRight size={13} />
                </button>
              </div>

              <p
                aria-hidden={ready}
                className={`label col-start-1 row-start-1 border border-transparent px-5 py-4 text-ink-dim transition-opacity duration-300 ${
                  ready ? 'pointer-events-none opacity-0' : 'opacity-100'
                }`}
              >
                NOTHING SELECTED — OR JUST WRITE BELOW.
              </p>
            </div>
          </div>

          {/* Right: the form itself */}
          <div>
            <form
              className="border-t border-rule"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {[
                { id: 'name', label: 'YOUR NAME', value: name, set: setName, type: 'text' },
                {
                  id: 'email',
                  label: hasEmail ? 'YOUR EMAIL' : 'YOUR EMAIL OR DISCORD TAG',
                  value: from,
                  set: setFrom,
                  type: hasEmail ? 'email' : 'text',
                },
              ].map((field) => (
                <div key={field.id} className="border-b border-rule py-5">
                  <label htmlFor={field.id} className="label mb-3 block text-ink-dim">
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    name={field.id}
                    type={field.type}
                    required
                    value={field.value}
                    onChange={(e) => field.set(e.target.value)}
                    autoComplete={field.id === 'email' ? 'email' : 'name'}
                    className="w-full bg-transparent text-lg text-ink outline-none placeholder:text-rule focus:placeholder:text-ink-dim"
                    placeholder="—"
                  />
                </div>
              ))}

              <div className="border-b border-rule py-5">
                <label htmlFor="message" className="label mb-3 block text-ink-dim">
                  WHAT ARE YOU BUILDING?
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full resize-none bg-transparent text-lg leading-relaxed text-ink outline-none placeholder:text-rule focus:placeholder:text-ink-dim"
                  placeholder="—"
                />
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-6">
                <MagneticButton
                  label="SEND"
                  type="submit"
                  className="label border border-ink px-8 py-4 text-ink transition-colors duration-300 hover:bg-ink hover:text-ground"
                >
                  {hasEmail ? 'SEND IT' : 'COPY & OPEN DISCORD'}
                  <ArrowUpRight size={14} />
                </MagneticButton>

                <p className="label max-w-[28ch] text-[9px] leading-relaxed text-ink-dim">
                  {copied
                    ? 'COPIED — PASTE IT IN THE SERVER OR DM @' +
                      contact.discordId.toUpperCase()
                    : hasEmail
                      ? 'OPENS YOUR MAIL CLIENT — NOTHING IS STORED ON THIS SITE.'
                      : 'COPIES YOUR BRIEF, THEN OPENS THE DISCORD INVITE — NOTHING IS STORED ON THIS SITE.'}
                </p>
              </div>
            </form>

            {/* Direct routes, for people who hate forms. */}
            <ul className="mt-12 border-t border-rule">
              {site.socials.map((s) => (
                <li key={s.label} className="border-b border-rule">
                  <a
                    href={s.href}
                    target={s.href.startsWith('mailto:') ? undefined : '_blank'}
                    rel="noreferrer"
                    data-cursor="OPEN"
                    className="group flex items-center justify-between py-4 transition-colors hover:text-ink-dim"
                  >
                    <span className="label">{s.label}</span>
                    <ArrowUpRight
                      size={16}
                      className="transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
