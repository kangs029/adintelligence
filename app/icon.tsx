import { ImageResponse } from "next/og";

export const contentType = "image/png";
export const size = {
  width: 32,
  height: 32,
};

export default function Icon() {
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
          borderRadius: 6,
          color: "#5eead4",
          fontFamily: "Arial, sans-serif",
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        X
      </div>
    ),
    size,
  );
}
