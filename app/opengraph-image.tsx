import { ImageResponse } from "next/og";

export const alt = "Xpat OS market intelligence dashboard";
export const contentType = "image/png";
export const size = {
  width: 1200,
  height: 630,
};

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 30% 26%, rgba(45, 212, 191, 0.22), transparent 28%), #06100f",
          color: "#f5f7f6",
          padding: 72,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 30,
            letterSpacing: 0,
            color: "#9fb7b2",
          }}
        >
          <span>XPAT OS</span>
          <span>Audience Intelligence</span>
        </div>
        <div style={{ display: "flex", gap: 56, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 690 }}>
            <div style={{ fontSize: 86, lineHeight: 0.94, fontWeight: 700 }}>
              Market proof for the USD to INR corridor
            </div>
            <div style={{ fontSize: 32, lineHeight: 1.25, color: "#c4d4d0" }}>
              Real evidence, provenance, and claim-safe playbooks for Xpat planning.
            </div>
          </div>
          <div
            aria-hidden="true"
            style={{
              display: "flex",
              width: 300,
              height: 300,
              borderRadius: 16,
              border: "1px solid rgba(148, 163, 184, 0.34)",
              position: "relative",
              background:
                "linear-gradient(135deg, rgba(20, 83, 75, 0.72), rgba(15, 23, 42, 0.78))",
              overflow: "hidden",
            }}
          >
            {[62, 112, 156, 206, 245].map((top, index) => (
              <div
                key={top}
                style={{
                  position: "absolute",
                  left: 36 + index * 46,
                  top,
                  width: index === 1 ? 34 : 22,
                  height: index === 1 ? 34 : 22,
                  borderRadius: "50%",
                  background: index === 1 ? "#5eead4" : "#14b8a6",
                  border: "3px solid rgba(255, 255, 255, 0.82)",
                  boxShadow: "0 0 38px rgba(45, 212, 191, 0.52)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
