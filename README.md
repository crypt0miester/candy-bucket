# Candy Bucket

Home to candy machine tools on the frontend. Currently only has candy wrapper. 
Which wraps up (withdraws and closes) your candy machine and withdraw the amount to your wallet.
we do take 1% of the total distributed for future development.

Candy Wrapper works for both CMv1 and CMv2

## Template:

The project uses [thuglabs/create-dapp-solana-nextjs](https://github.com/thuglabs/create-dapp-solana-nextjs) as a base. but it has upgraded packages.

This project includes and uses the latest packages from:

-   Next.JS
-   TypeScript
-   [@solana/wallet-adapter](https://github.com/solana-labs/wallet-adapter) and [@solana/web3.js](https://solana-labs.github.io/solana-web3.js) for interactions with wallets & blockchain.
-   Tailwind CSS (with [daisyUI](https://daisyui.com/))

## Getting Started

First, run the development server:

```bash
yarn install
yarn dev
```

## Style

[Tailwind CSS](https://tailwindcss.com/) or [daisyUI](https://daisyui.com/) are selected tools for rapid style development.

You can quickly change theme changing `daisy.themes` within `./tailwind.config.js`.
More info here: https://daisyui.com/docs/default-themes

This app encourage you to use CSS Modules over other style technics (like SASS/LESS, Styled Components, usual CSS).
It have modular nature and supports modern CSS. [Read more on Next.JS site](https://nextjs.org/docs/basic-features/built-in-css-support).
Anyway, if you want to connect LESS there is example code in `./next.config.js`

## Deploy on Vercel

Before push run localy `yarn build` to make sure app can be build succesffully on vercel .

Vercel will automatically create environment and deployment for you if you have vercel account connected to your GitHub account. Go to the vercel.com to connect it.
Then any push to `main` branch will automatically rebuild and redploy app.
