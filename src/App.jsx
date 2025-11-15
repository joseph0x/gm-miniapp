import { useState, useEffect } from "react";
import {
  useAccount,
  useConnect,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { parseEther, parseAbi, parseAbiItem } from "viem";
import { sdk } from "@farcaster/miniapp-sdk";

function App() {
  const [gmCount, setGmCount] = useState(0);
  const [saidGm, setSaidGm] = useState(0);
  const [receivedGm, setReceivedGm] = useState(0);
  const [lastGmAt, setLastGmAt] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const publicClient = usePublicClient();

  const CONTRACT_ADDRESS = "0x978099EC2949F88AF89535a1Aa3282c5E97Ba0CD"; // your deployed address
  const GM_COST_ETH = "0.000001";
  const GM_ABI = parseAbi([
    "function sayGM() payable",
    "function getUser(address) view returns (uint256 count, uint256 last)",
    "function totalUsers() view returns (uint256)",
    "function userAt(uint256) view returns (address)",
    "event GM(address indexed user, uint256 timestamp)",
  ]);

  useEffect(() => {
    sdk.actions.ready();
  }, []);

  const [carouselItems, setCarouselItems] = useState([]);

  // Countdown updater
  useEffect(() => {
    const timer = setInterval(() => {
      if (lastGmAt) {
        const diffMs = 24 * 60 * 60 * 1000 - (Date.now() - lastGmAt);
        setRemaining(Math.max(0, Math.ceil(diffMs / 1000)));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lastGmAt]);

  // Load your stats from contract
  useEffect(() => {
    const loadSelf = async () => {
      if (!isConnected || !address) return;
      try {
        const [count, last] = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: GM_ABI,
          functionName: "getUser",
          args: [address],
        });
        setSaidGm(Number(count));
        if (Number(last) > 0) setLastGmAt(Number(last) * 1000);
      } catch {}
    };
    loadSelf();
  }, [isConnected, address]);

  // Load leaderboard and overall GM count
  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        const total = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: GM_ABI,
          functionName: "totalUsers",
        });
        const users = [];
        for (let i = 0; i < Number(total); i++) {
          const user = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: GM_ABI,
            functionName: "userAt",
            args: [BigInt(i)],
          });
          const [count] = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: GM_ABI,
            functionName: "getUser",
            args: [user],
          });
          users.push({ address: user, count: Number(count) });
        }
        users.sort((a, b) => b.count - a.count);
        const overall = users.reduce((sum, u) => sum + u.count, 0);
        setGmCount(overall);
        // You can render top N in UI later if/when you add that section
      } catch {}
    };
    loadLeaderboard();
  }, []);

  // Load recent 24h GM events for carousel
  useEffect(() => {
    const loadRecent = async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        const approx24hBlocks = 43200n; // ~2s per block * 24h
        const fromBlock =
          latest > approx24hBlocks ? latest - approx24hBlocks : 0n;
        const gmEvent = parseAbiItem(
          "event GM(address indexed user, uint256 timestamp)"
        );
        const logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: gmEvent,
          fromBlock,
          toBlock: latest,
        });
        const addrs = logs.map((l) => l.args.user);
        const short = addrs.map((a) => `${a.slice(0, 6)}...${a.slice(-4)}`);
        // Duplicate for infinite effect
        setCarouselItems([...short, ...short, ...short]);
      } catch {}
    };
    loadRecent();
  }, []);

  const farcasterConnector = connectors.find((c) =>
    c.id?.toLowerCase().includes("farcaster")
  );

  // ... existing code ...
  const handleGmClick = async () => {
    setError("");
    if (!isConnected) {
      setError("Please connect your Farcaster wallet first.");
      return;
    }
    if (isWriting || remaining > 0) return;
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: GM_ABI,
        functionName: "sayGM",
        value: parseEther(GM_COST_ETH),
      });

      await publicClient.waitForTransactionReceipt({ hash });

      const [count, last] = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: GM_ABI,
        functionName: "getUser",
        args: [address],
      });
      setSaidGm(Number(count));
      setLastGmAt(Number(last) * 1000);
      setGmCount((c) => c + 1);
    } catch (e) {
      setError(e?.shortMessage || e?.message || "Transaction failed.");
    }
  };

  return (
    <div style={styles.appContainer}>
      {/* Header Section */}
      <div style={styles.header}>
        <div style={styles.stats}>
          <p style={styles.statText}>Your GMs : {saidGm}</p>
          <p style={styles.statText}>GMs received : {receivedGm} </p>
          <p style={styles.statText}>
            Overall GM Count: {gmCount.toLocaleString()}
          </p>
          {/* Trophy Icon */}
          <div style={styles.trophyIcon}>
            <img
              src="https://gmminiapp.vercel.app/leaderboard.png"
              alt="leaderboard"
              height="48"
              width="48"
            />
          </div>
        </div>

        <button
          style={styles.walletBtn}
          onClick={() =>
            farcasterConnector
              ? connect({ connector: farcasterConnector })
              : setError("Farcaster connector not detected.")
          }
          disabled={isConnecting}
        >
          {isConnected
            ? `${address?.slice(0, 6)}...${address?.slice(-4)}`
            : "CONNECT WALLET"}
        </button>
      </div>
      {/* Center GM Button */}
      <div style={styles.centerSection}>
        {remaining > 0 ? (
          <div style={{ fontWeight: 700, fontSize: 24 }}>
            {(() => {
              const h = Math.floor(remaining / 3600);
              const m = Math.floor((remaining % 3600) / 60);
              const s = remaining % 60;
              const pad = (n) => String(n).padStart(2, "0");
              return `NEXT GM IN ${pad(h)}:${pad(m)}:${pad(s)}`;
            })()}
          </div>
        ) : (
          <button
            style={styles.gmBtn}
            onClick={handleGmClick}
            disabled={!isConnected || isWriting}
          >
            <span style={styles.gmBtnText}>HIT TO SAY 'GM'</span>
          </button>
        )}
      </div>
      {/* Carousel Footer */}
      <div style={styles.carouselContainer}>
        <div style={styles.carousel}>
          {carouselItems.map((wallet, index) => (
            <div key={index} style={styles.carouselItem}>
              <span style={styles.walletAddress}>{wallet}</span>
              <span style={styles.saidGmText}> said GM</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  appContainer: {
    width: "100%",
    maxWidth: "400px",
    minHeight: "600px",
    margin: "auto",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    background: "#fff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
  },
  stats: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flex: 1,
  },
  trophyIcon: {
    width: "48px",
    height: "48px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    marginTop: "8px",
  },
  statText: {
    fontSize: "0.9rem",
    margin: "0",
    lineHeight: "1.4",
  },
  walletBtn: {
    padding: "10px 12px",
    border: "2px solid #000",
    borderRadius: "8px",
    background: "none",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "0.75rem",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  centerSection: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  gmBtn: {
    width: "220px",
    height: "220px",
    background: "#0000FF",
    border: "none",
    borderRadius: "50%",
    fontSize: "1.4rem",
    fontWeight: "700",
    color: "#FFFFFF",
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(0, 0, 255, 0.3)",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
  gmBtnText: {
    display: "block",
    lineHeight: "1.5",
  },
  carouselContainer: {
    width: "calc(100% + 40px)",
    marginLeft: "-20px",
    marginRight: "-20px",
    overflow: "hidden",
    position: "relative",
    paddingBottom: "10px",
  },
  carousel: {
    display: "flex",
    gap: "30px",
    animation: "scroll 30s linear infinite",
    width: "max-content",
    paddingLeft: "20px",
  },
  carouselItem: {
    fontSize: "0.85rem",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  walletAddress: {
    fontWeight: "700",
  },
  saidGmText: {
    fontWeight: "400",
  },
  countdownText: {
    textAlign: "center",
    fontSize: "0.9rem",
    marginBottom: "10px",
  },
};

// Add keyframes animation via style tag
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes scroll {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-33.33%);
    }
  }
  
  button:hover {
    transform: scale(1.05);
  }
  
  button:active {
    transform: scale(0.95);
  }

  @media (max-width: 480px) {
    .gm-btn {
      width: 180px !important;
      height: 180px !important;
      font-size: 1.2rem !important;
    }
  }
`;
document.head.appendChild(styleSheet);

export default App;
