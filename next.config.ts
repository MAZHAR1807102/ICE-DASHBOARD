import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow your local network IPs to access the dev server
  allowedDevOrigins: ['192.168.1.119', '192.168.0.199'], 
};

export default nextConfig;