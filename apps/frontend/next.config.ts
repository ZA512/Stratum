import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Réactivation du blocage build sur erreurs ESLint pour remonter la qualité
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
