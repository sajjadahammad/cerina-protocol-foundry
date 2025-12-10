import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // reactCompiler: true, // Disabled - requires babel-plugin-react-compiler package
  // Turbopack is the default in Next.js 16 and handles web workers automatically
  turbopack: {},
};

export default nextConfig;
