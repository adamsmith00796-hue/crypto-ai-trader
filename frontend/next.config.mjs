/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Dev-time proxy so the browser only ever talks to same-origin /api/*.
    // In production point this at your deployed backend URL instead.
    const backend = process.env.BACKEND_URL || "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
