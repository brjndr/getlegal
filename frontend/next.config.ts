import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The backend serves the app as static files from `out/`.
  output: "export",
  // Emits `login/index.html` rather than `login.html`, which is what the backend's file server looks for.
  trailingSlash: true,
};

export default nextConfig;
