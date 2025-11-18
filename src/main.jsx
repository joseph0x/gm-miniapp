import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

import { http, createConfig, WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fallback } from "viem";

const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: fallback([
      http("https://base-rpc.publicnode.com"),
      http("https://base.meowrpc.com"),
      http("https://mainnet.base.org"),
    ]),
  },
  connectors: [farcasterMiniApp()],
});

const queryClient = new QueryClient();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <App />
      </WagmiProvider>
    </QueryClientProvider>
  </StrictMode>
);
