import Link from "next/link";
import { Star, Heart, Truck } from "lucide-react";
import { addToCart, toggleWishlist } from "@/lib/actions";
import { effectivePrice } from "@/lib/pricing";
import ProductImage from "./ProductImage";
import AddToCartButton from "./AddToCartButton";

type Props = {
  id: string;
  name: string;
  price: number;
  image: string;
  shippingMinDays: number;
  shippingMaxDays: number;
  discountPercent?: number;
  stock?: number;
  rating?: { avg: number; count: number };
  isWishlisted?: boolean;
};

export default function ProductCard({
  id,
  name,
  price,
  image,
  shippingMinDays,
  shippingMaxDays,
  discountPercent = 0,
  stock,
  rating,
  isWishlisted,
}: Props) {
  const discounted = discountPercent > 0;
  const finalPrice = effectivePrice({ price, discountPercent });
  const soldOut = stock !== undefined && stock <= 0;
  const lowStock = stock !== undefined && stock > 0 && stock < 10;

  return (
    <div className="group relative rounded-2xl bg-white border border-[#e5e5e8] overflow-hidden flex flex-col hover:border-[#ff5a1f]/60 transition-colors">
      {discounted && (
        <span className="absolute top-2 left-2 z-10 bg-[#ff5a1f] text-white text-xs font-bold px-2 py-0.5 rounded-lg">
          -{discountPercent}%
        </span>
      )}
      <form
        action={async () => {
          "use server";
          await toggleWishlist(id);
        }}
        className="absolute top-2 right-2 z-10"
      >
        <button
          type="submit"
          aria-label="Zur Wunschliste"
          className="w-8 h-8 rounded-full bg-white/90 border border-[#e5e5e8] flex items-center justify-center hover:border-[#ff5a1f] transition-colors"
        >
          <Heart
            size={16}
            className={isWishlisted ? "text-[#ff5a1f]" : "text-[#6b6b76]"}
            fill={isWishlisted ? "currentColor" : "none"}
          />
        </button>
      </form>
      <Link href={`/product/${id}`} className="flex flex-col flex-1">
        <div className="aspect-square bg-[#f4f4f5] flex items-center justify-center text-5xl overflow-hidden">
          <ProductImage image={image} className="text-5xl w-full h-full object-cover flex items-center justify-center" />
        </div>
        <div className="p-3 flex flex-col gap-1 flex-1">
          <h3 className="font-medium text-sm text-[#1c1c1f] line-clamp-2 min-h-[2.4rem]">{name}</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-extrabold text-[#ff5a1f]">{finalPrice.toFixed(2)} €</p>
            {discounted && (
              <p className="text-xs text-[#6b6b76] line-through">{price.toFixed(2)} €</p>
            )}
          </div>
          {rating && rating.count > 0 && (
            <div className="flex items-center gap-1">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={12}
                    className={i < Math.round(rating.avg) ? "text-[#ff5a1f]" : "text-[#e5e5e8]"}
                    fill={i < Math.round(rating.avg) ? "currentColor" : "none"}
                  />
                ))}
              </div>
              <span className="text-[11px] text-[#6b6b76]">({rating.count})</span>
            </div>
          )}
          {soldOut ? (
            <span className="text-[11px] font-medium text-[#6b6b76] bg-[#f4f4f5] border border-[#e5e5e8] rounded-full px-2 py-0.5 self-start">
              Ausverkauft
            </span>
          ) : lowStock ? (
            <span className="text-[11px] font-medium text-[#ff5a1f]">Nur noch {stock} verfügbar</span>
          ) : (
            <span className="text-[11px] text-[#1faa59]">Auf Lager</span>
          )}
          <p className="text-[11px] text-[#6b6b76] flex items-center gap-1">
            <Truck size={12} /> {shippingMinDays}-{shippingMaxDays} Tage
          </p>
        </div>
      </Link>
      <form action={async () => { "use server"; await addToCart(id, 1); }} className="p-3 pt-0">
        <AddToCartButton
          disabled={soldOut}
          iconSize={14}
          className="w-full bg-[#ff5a1f] text-white text-sm py-2 rounded-lg font-semibold hover:opacity-90 active:scale-95 disabled:bg-[#e5e5e8] disabled:text-[#6b6b76] disabled:active:scale-100"
        />
      </form>
    </div>
  );
}
