/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdfkit', 'pg', 'pdf-parse']
  }
}

module.exports = nextConfig
