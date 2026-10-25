import { ImageResponse } from "next/og";

export const contentType = "image/png";
export const size = {
  width: 180,
  height: 180,
};

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          display: "flex",
          background: "#06100f",
          borderRadius: 36,
          color: "#5eead4",
          fontFamily: "Arial, sans-serif",
          fontSize: 86,
          fontWeight: 700,
        }}
      >
        X
      </div>
    ),
    size,
  );
}
