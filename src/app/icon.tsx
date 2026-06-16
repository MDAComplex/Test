import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <svg width={32} height={32} viewBox="0 0 32 32">
        <rect width="32" height="32" rx="7" fill="#ff5a1f" />
        <path d="M8 9h6.5l3 14 9-14h4l-11 18h-3.5z" fill="#ffffff" />
      </svg>
    ),
    { ...size }
  );
}
