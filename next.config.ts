import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow your local network IPs to access the dev server
  allowedDevOrigins: ['192.168.1.119', '192.168.0.199', '192.168.0.198', '172.20.10.2'] 
};

export default nextConfig;