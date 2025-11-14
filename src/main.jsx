import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

import { http, createConfig, WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";

const wagmiConfig = createConfig({
  chains: [base],
  transports: { [base.id]: http("https://mainnet.base.org") },
  connectors: [farcasterMiniApp()],
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <App />
    </WagmiProvider>
  </StrictMode>
);
