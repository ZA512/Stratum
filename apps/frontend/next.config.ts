import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Réactivation du blocage build sur erreurs ESLint pour remonter la qualité
    ignoreDuringBuilds: false,
  },
  // Correction du problème de workspace root
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
