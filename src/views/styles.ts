import styled from 'styled-components';

export const CTAButton = styled.button`
    display: block !important;
    margin: 0 auto !important;
    min-width: 120px !important;
`;

export const WalletContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
`;

export const WalletAmount = styled.div`
    color: white;
    width: auto;
    padding: 5px 5px 5px 16px;
    min-width: 48px;
    min-height: auto;
    border-radius: 5px;
    box-shadow: 0px 3px 5px -1px rgb(0 0 0 / 20%), 0px 6px 10px 0px rgb(0 0 0 / 14%),
        0px 1px 18px 0px rgb(0 0 0 / 12%);
    box-sizing: border-box;
    transition: background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
        box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
        border 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
    font-weight: 500;
    line-height: 1.75;
    text-transform: uppercase;
    border: 0;
    margin: 0;
    display: inline-flex;
    outline: 0;
    position: relative;
    align-items: center;
    user-select: none;
    vertical-align: middle;
    justify-content: flex-start;
    gap: 10px;
`;

export const WalletHeader = styled.ul`
    flex: 0 0 auto;
    margin: 0;
    padding: 0;
`;

// export const ConnectButton = styled(WalletMultiButton)`
//   border-radius: 5px !important;
//   padding: 6px 16px;
//   background-color: #4E44CE;
//   margin: 0 auto;
// `;

export const MintButtonContainer = styled.div`
    button.MuiButton-contained:not(.MuiButton-containedPrimary).Mui-disabled {
        color: #464646;
    }

    button.MuiButton-contained:not(.MuiButton-containedPrimary):hover,
    button.MuiButton-contained:not(.MuiButton-containedPrimary):focus {
        -webkit-animation: pulse 1s;
        animation: pulse 1s;
        box-shadow: 0 0 0 2em rgba(255, 255, 255, 0);
    }

    @-webkit-keyframes pulse {
        0% {
            box-shadow: 0 0 0 0 #ef8f6e;
        }
    }

    @keyframes pulse {
        0% {
            box-shadow: 0 0 0 0 #ef8f6e;
        }
    }
`;

export const Logo = styled.div`
    flex: 0 0 auto;

    img {
        height: 60px;
    }
`;
export const Menu = styled.ul`
    list-style: none;
    display: inline-flex;
    flex: 1 0 auto;

    li {
        margin: 0 12px;

        a {
            color: var(--main-text-color);
            list-style-image: none;
            list-style-position: outside;
            list-style-type: none;
            outline: none;
            text-decoration: none;
            text-size-adjust: 100%;
            touch-action: manipulation;
            transition: color 0.3s;
            padding-bottom: 15px;

            img {
                max-height: 26px;
            }
        }

        a:hover,
        a:active {
            opacity: 92%;
            border-bottom: 4px solid rgb(76, 29, 149);
        }
    }
`;

export const SolExplorerLink = styled.a`
    color: var(--title-text-color);
    border-bottom: 1px solid var(--title-text-color);
    font-weight: bold;
    list-style-image: none;
    list-style-position: outside;
    list-style-type: none;
    outline: none;
    text-decoration: none;
    text-size-adjust: 100%;

    :hover {
        border-bottom: 2px solid var(--title-text-color);
    }
`;

export const MainContainer = styled.div`
    display: flex;
    flex-direction: column;
    margin-top: 20px;
    margin-bottom: 20px;
    margin-right: 4%;
    margin-left: 4%;
    text-align: center;
    justify-content: center;
`;

export const MintContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex: 1 1 auto;
    flex-wrap: wrap;
    gap: 20px;
`;

export const DesContainer = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: 20px;
`;

export const Image = styled.img`
    height: 400px;
    width: auto;
    border-radius: 7px;
    box-shadow: 5px 5px 40px 5px rgba(0, 0, 0, 0.5);
`;

export const ShimmerTitle = styled.h1`
    margin: 20px auto;
    text-transform: uppercase;
    animation: glow 2s ease-in-out infinite alternate;
    color: var(--main-text-color);
    @keyframes glow {
        from {
            text-shadow: 0 0 20px var(--main-text-color);
        }
        to {
            text-shadow: 0 0 30px var(--title-text-color), 0 0 10px var(--title-text-color);
        }
    }
`;

export const Title = styled.h2`
    color: var(--title-text-color);
`;

export const LogoAligner = styled.div`
    display: flex;
    align-items: center;

    img {
        max-height: 35px;
        margin-right: 10px;
    }
`;
