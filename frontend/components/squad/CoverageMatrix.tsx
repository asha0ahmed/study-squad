import type { MemberStatus } from "@/lib/types";

export interface CoverageMatrixMember {
  slot: number;
  name: string;
  covers: string[];
  status?: MemberStatus;
}

const TOTAL_SLOTS = 6;

export function CoverageMatrix({
  subjects,
  members,
}: {
  subjects: { id: number; name: string }[];
  members: CoverageMatrixMember[];
}) {
  const bySlot = new Map(members.map((m) => [m.slot, m]));
  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => i + 1);

  return (
    <div className="overflow-x-auto border border-ink bg-parchment">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-ink">
            <th className="w-40 shrink-0 border-r border-ink px-4 py-3 text-left font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-45">
              Subject
            </th>
            {slots.map((slot) => {
              const member = bySlot.get(slot);
              return (
                <th
                  key={slot}
                  className={
                    "border-r border-ink-10 px-3 py-3 text-center last:border-r-0 " +
                    (member ? "" : "bg-parchment-dim")
                  }
                >
                  <span className="block font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-45">
                    Slot {slot}
                  </span>
                  {member ? (
                    <>
                      <span className="mt-1 block font-serif text-base font-medium text-ink">
                        {member.name}
                      </span>
                      <span
                        className={
                          "mt-0.5 block font-sans text-[10px] font-semibold uppercase tracking-[0.06em] " +
                          (member.status === "confirmed" ? "text-emerald" : "text-amber")
                        }
                      >
                        {member.status === "confirmed" ? "Confirmed" : "Pending"}
                      </span>
                    </>
                  ) : (
                    <span className="mt-1 block font-serif text-base italic text-ink-45">
                      Open
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, i) => (
            <tr
              key={subject.id}
              className={i !== subjects.length - 1 ? "border-b border-ink-10" : ""}
            >
              <td className="border-r border-ink px-4 py-3 font-sans text-sm text-ink">
                {subject.name}
              </td>
              {slots.map((slot) => {
                const member = bySlot.get(slot);
                const covered = member?.covers.includes(subject.name) ?? false;
                return (
                  <td
                    key={slot}
                    className={
                      "border-r border-ink-10 px-3 py-3 text-center last:border-r-0 " +
                      (member ? "" : "bg-parchment-dim")
                    }
                  >
                    {covered && (
                      <span
                        aria-label={`${member?.name} covers ${subject.name}`}
                        className="inline-block h-2.5 w-2.5 border border-oxblood bg-oxblood"
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
