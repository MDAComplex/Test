import Link from "next/link";
import { addToCart } from "@/lib/actions";
import ProductImage from "./ProductImage";

type Props = {
  id: string;
  name: string;
  price: number;
  image: string;
  shippingMinDays: number;
  shippingMaxDays: number;
};

export default function ProductCard({ id, name, price, image, shippingMinDays, shippingMaxDays }: Props) {
  return (
    <div className="group rounded-2xl bg-[#1a1a22] border border-[#2c2c38] overflow-hidden flex flex-col hover:border-[#ff2d92]/60 transition-colors">
      <Link href={`/product/${id}`} className="flex flex-col flex-1">
        <div className="aspect-square bg-[#22222c] flex items-center justify-center text-5xl overflow-hidden">
          <ProductImage image={image} className="text-5xl w-full h-full object-cover flex items-center justify-center" />
        </div>
        <div className="p-3 flex flex-col gap-1 flex-1">
          <h3 className="font-medium text-sm text-[#f4f4f8] line-clamp-2 min-h-[2.4rem]">{name}</h3>
          <p className="text-lg font-extrabold text-[#ff2d92]">{price.toFixed(2)} €</p>
          <p className="text-[11px] text-[#6b6b7a]">🚚 {shippingMinDays}-{shippingMaxDays} Tage</p>
        </div>
      </Link>
      <form action={async () => { "use server"; await addToCart(id, 1); }} className="p-3 pt-0">
        <button className="w-full bg-[#ff2d92] text-white text-sm py-2 rounded-xl font-semibold hover:opacity-90 active:scale-95 transition">
          In den Warenkorb
        </button>
      </form>
    </div>
  );
}
