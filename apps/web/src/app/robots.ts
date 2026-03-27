import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/login', '/register'],
                disallow: ['/dashboard/', '/api/'],
            },
        ],
        sitemap: 'https://github.com/shuvoooo/termi/sitemap.xml',
    };
}
