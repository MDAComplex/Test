function isUrlLike(value: string) {
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");
}

export default function ProductImage({ image, className }: { image: string; className?: string }) {
  if (isUrlLike(image)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className={className ?? "w-full h-full object-cover"} />
    );
  }
  return <span className={className}>{image}</span>;
}
