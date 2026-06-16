import Link from "next/link";
import { addToCart } from "@/lib/actions";

type Props = {
  id: string;
  name: string;
  price: number;
  image: string;
  shippingMinDays: number;
  shippingMaxDays: number;
  categoryEmoji?: string;
};

export default function ProductCard({ id, name, price, image, shippingMinDays, shippingMaxDays }: Props) {
  return (
    <div className="border rounded-xl p-4 flex flex-col gap-2 bg-white hover:shadow-lg transition-shadow">
      <Link href={`/product/${id}`} className="flex flex-col gap-2">
        <div className="text-6xl text-center py-6 bg-violet-50 rounded-lg">{image}</div>
        <h3 className="font-semibold text-sm line-clamp-2 min-h-[2.5rem]">{name}</h3>
        <p className="text-xl font-bold text-violet-700">{price.toFixed(2)} €</p>
        <p className="text-xs text-gray-500">🚚 Lieferung in {shippingMinDays}-{shippingMaxDays} Tagen</p>
      </Link>
      <form action={async () => { "use server"; await addToCart(id, 1); }}>
        <button className="w-full mt-1 bg-violet-700 text-white text-sm py-2 rounded-lg hover:bg-violet-800">
          In den Warenkorb
        </button>
      </form>
    </div>
  );
}
