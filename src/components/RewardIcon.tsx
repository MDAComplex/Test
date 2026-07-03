import {
  Store,
  Sparkles,
  Gem,
  Crown,
  PartyPopper,
  Trophy,
  Heart,
  Moon,
  Flame,
  Medal,
  type LucideIcon,
} from "lucide-react";

// Mappt die iconKeys aus src/lib/rewards.ts auf lucide-Icons (statt Emojis).
const ICONS: Record<string, LucideIcon> = {
  store: Store,
  sparkles: Sparkles,
  gem: Gem,
  crown: Crown,
  party: PartyPopper,
  trophy: Trophy,
  heart: Heart,
  moon: Moon,
  flame: Flame,
};

export default function RewardIcon({
  iconKey,
  size = 18,
  className,
}: {
  iconKey: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[iconKey] ?? Medal;
  return <Icon size={size} className={className} />;
}
