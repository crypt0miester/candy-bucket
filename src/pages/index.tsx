import type { NextPage } from 'next';
import Head from 'next/head';
import { positions, Provider as AlertProvider, transitions } from 'react-alert';
import AlertTemplate from 'react-alert-template-basic';

import { CandyWrapper } from '../views';

const options = {
    position: positions.BOTTOM_LEFT,
    timeout: 5000,
    offset: '10px',
    transition: transitions.SCALE
};

const Home: NextPage = () => (
    <div>
        <Head>
            <title>Candy Bucket</title>
        </Head>
        <AlertProvider template={AlertTemplate} {...options}>
            <CandyWrapper />
        </AlertProvider>
    </div>
);

export default Home;
