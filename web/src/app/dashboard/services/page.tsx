"use client";

import {
  faMobileScreen,
  faBolt,
  faUsers,
  faBell,
  faPlug,
  faTv,
  faGamepad,
  faWallet,
  faPlus,
  faComments,
  faRobot,
  faArrowUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";
import { DashboardShell } from "@/components/dashboard/shell";
import { FaIcon } from "@/components/shared/fa-icon";
import { useAuth } from "@/lib/auth-context";
import { BOT_SERVICES, type ServiceAction } from "@/lib/bot-services";
import { serviceWhatsAppHref } from "@/lib/bot-services";

const ICONS: Record<ServiceAction["icon"], typeof faBolt> = {
  mobile: faMobileScreen,
  bolt: faBolt,
  users: faUsers,
  bell: faBell,
  plug: faPlug,
  tv: faTv,
  gamepad: faGamepad,
  wallet: faWallet,
  plus: faPlus,
  comments: faComments,
  robot: faRobot,
};

const GROUPS: { id: ServiceAction["group"]; title: string }[] = [
  { id: "vtu", title: "Airtime & data" },
  { id: "bills", title: "Bills" },
  { id: "account", title: "Wallet & account" },
  { id: "more", title: "More" },
];

export default function ServicesPage() {
  const { user } = useAuth();

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Services</h1>
          <p className="mt-1 text-sm text-gray-500">
            Same actions as WhatsApp — opens the bot already knowing what you want
            {user?.phone ? ", linked to your number." : "."}
          </p>
        </div>

        {GROUPS.map((g) => {
          const items = BOT_SERVICES.filter((s) => s.group === g.id);
          return (
            <section key={g.id}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                {g.title}
              </h2>
              <div className="space-y-2">
                {items.map((s) => (
                  <a
                    key={s.id}
                    href={serviceWhatsAppHref(s, user?.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-3xl border border-white bg-white p-4 shadow-sm shadow-violet-900/5 transition active:scale-[0.99]"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                      <FaIcon icon={ICONS[s.icon]} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900">{s.label}</p>
                      <p className="truncate text-xs text-gray-500">{s.hint}</p>
                    </div>
                    <FaIcon
                      icon={faArrowUpRightFromSquare}
                      className="h-3.5 w-3.5 text-violet-400"
                    />
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </DashboardShell>
  );
}
