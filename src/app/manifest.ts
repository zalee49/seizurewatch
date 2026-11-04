import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SeizureWatch",
    short_name: "SeizureWatch",
    description: "Track your dog's seizures, medication and bloodwork in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ee",
    theme_color: "#286957",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
  };
}
