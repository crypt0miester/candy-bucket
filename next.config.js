/** @type {import('next').NextConfig} */
const withPlugins = require('next-compose-plugins');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === 'true'
});
/** eslint-disable @typescript-eslint/no-var-requires */
const withTM = require('next-transpile-modules')([
    '@solana/wallet-adapter-base',
    // Uncomment wallets you want to use
    // "@solana/wallet-adapter-bitpie",
    // "@solana/wallet-adapter-coin98",
    // "@solana/wallet-adapter-ledger",
    '@solana/wallet-adapter-glow',
    '@solana/wallet-adapter-phantom',
    '@solana/wallet-adapter-react',
    '@solana/wallet-adapter-solflare',
    '@solana/wallet-adapter-slope',
    // "@solana/wallet-adapter-solong",
    // "@solana/wallet-adapter-torus",
    '@solana/wallet-adapter-wallets'
    // "@project-serum/sol-wallet-adapter",
    // "@solana/wallet-adapter-ant-design",
]);

// add this if you need LESS
// also install less and less-loader
// const withLess = require("next-with-less");

const plugins = [
    // add this if you need LESS
    // [withLess, {
    //   lessLoaderOptions: {
    //     /* ... */
    //   },
    // }],
    [withBundleAnalyzer],
    [
        withTM,
        {
            webpack5: true,
            reactStrictMode: true
        }
    ]
];

const nextConfig = {
    images: {
        loader: 'custom'
    },
    distDir: 'build',
    swcMinify: true,
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.fallback.fs = false;
            // Object.assign(config.resolve.alias, {
            //     react: 'preact/compat',
            //     'react-dom/test-utils': 'preact/test-utils',
            //     'react-dom': 'preact/compat',
            //   })
        }
        return config;
    }
};

module.exports = withPlugins(plugins, nextConfig);
