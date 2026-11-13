import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  text: string;
  phase: string;
}

/** Placeholder for deck views that are not built yet. */
export function ComingView({ icon: Icon, title, text, phase }: Props) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl border border-line bg-panel text-indigo-300">
          <Icon className="size-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-100">{title}</h2>
        <p className="mt-1.5 text-slate-400">{text}</p>
        <p className="mt-4 text-[11px] tracking-wide text-slate-500 uppercase">Planned: {phase}</p>
      </div>
    </div>
  );
}
