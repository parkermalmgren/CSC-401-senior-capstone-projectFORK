import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.smartpantryai.com", pathname: "/**" },
      { protocol: "https", hostname: "img.spoonacular.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
