import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The invoice template is read from disk at request time rather than
   * imported, because it is 160KB of mostly base64 logo and belongs to the
   * user, not to the bundle — they can edit the HTML without touching code.
   *
   * Nothing `import`s it, so Next's tracer has no way to know a server route
   * needs it, and the file would be missing on Vercel while working fine
   * locally. Named explicitly, and kept to the one file: the docs warn that
   * broad patterns here bloat the trace.
   */
  outputFileTracingIncludes: {
    "/*": ["src/lib/invoices/template.html"],
  },
};

export default nextConfig;
