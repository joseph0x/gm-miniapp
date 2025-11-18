import { useState, useEffect, useCallback } from "react";
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
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const publicClient = usePublicClient();

  const CONTRACT_ADDRESS = "0x978099EC2949F88AF89535a1Aa3282c5E97Ba0CD";
  const GM_COST_ETH = "0.000001";
  const GM_ABI = parseAbi([
    "function sayGM() payable",
    "function getUser(address) view returns (uint256 count, uint256 last)",
    "function totalUsers() view returns (uint256)",
    "function userAt(uint256) view returns (address)",
    "event GM(address indexed user, uint256 timestamp)",
  ]);

  useEffect(() => {
    try {
      sdk.actions.ready();
    } catch (e) {
      console.error("SDK ready failed:", e);
    }
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

  // Load your stats from contract - OPTIMIZED
  const loadUserStats = useCallback(async () => {
    if (!isConnected || !address || !publicClient) return;
    try {
      const [count, last] = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: GM_ABI,
        functionName: "getUser",
        args: [address],
      });
      setSaidGm(Number(count));
      if (Number(last) > 0) setLastGmAt(Number(last) * 1000);
    } catch (e) {
      console.error("Load self failed:", e);
    }
  }, [isConnected, address, publicClient]);

  useEffect(() => {
    loadUserStats();
  }, [loadUserStats]);

  // OPTIMIZED: Load only total GM count, not individual users
  const loadGmCount = useCallback(async () => {
    if (!publicClient) return;
    try {
      const total = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: GM_ABI,
        functionName: "totalUsers",
      });

      const totalNum = Number(total);
      if (totalNum === 0) {
        setIsInitialLoad(false);
        return;
      }

      // Just load first 10 users to calculate approximate total GMs
      const limit = Math.min(totalNum, 10);
      let totalGms = 0;

      for (let i = 0; i < limit; i++) {
        try {
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
          totalGms += Number(count);
        } catch (e) {
          console.error(`Failed to load user ${i}:`, e);
        }
      }

      // Estimate total based on sample
      const estimated = Math.round((totalGms / limit) * totalNum);
      setGmCount(estimated);
      setIsInitialLoad(false);
    } catch (e) {
      console.error("Load GM count failed:", e);
      setIsInitialLoad(false);
    }
  }, [publicClient]);

  useEffect(() => {
    loadGmCount();
  }, [loadGmCount]);

  // OPTIMIZED: Load recent GM events for carousel - reduced block range
  // ... existing code ...
  // ... existing code ...
  const loadRecentGms = useCallback(async () => {
    if (!publicClient) return;
    try {
      const latest = await publicClient.getBlockNumber();
      // Reduced range for reliability
      const approx6hBlocks = 43200n;
      const fromBlock = latest > approx6hBlocks ? latest - approx6hBlocks : 0n;

      const gmEvent = parseAbiItem(
        "event GM(address indexed user, uint256 timestamp)"
      );
      console.log("[GM Logs] Querying logs", {
        latest: latest.toString(),
        fromBlock: fromBlock.toString(),
      });
      const logs = await publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: gmEvent,
        fromBlock,
        toBlock: latest,
      });
      console.log("[GM Logs] Logs count:", logs.length);

      if (logs.length === 0) {
        setCarouselItems([]);
        console.log("[GM Logs] No logs found in range.");
        return;
      }

      const uniqueAddresses = [];
      const seen = new Set();

      for (let i = logs.length - 1; i >= 0 && uniqueAddresses.length < 5; i--) {
        const addr = logs[i].args.user;
        if (!seen.has(addr)) {
          seen.add(addr);
          uniqueAddresses.push(addr);
        }
      }

      console.log("[GM Logs] Unique addresses:", uniqueAddresses);

      const short = uniqueAddresses.map(
        (a) => `${a.slice(0, 6)}...${a.slice(-4)}`
      );
      console.log("[GM Logs] Carousel addresses:", short);
      setCarouselItems([...short, ...short, ...short, ...short]);
    } catch (e) {
      console.error("Load recent failed:", e);
      console.log("[GM Logs] Retrying with smaller block range...");
      try {
        const latest = await publicClient.getBlockNumber();
        const smallRange = 4000n;
        const fromBlock = latest > smallRange ? latest - smallRange : 0n;

        const gmEvent = parseAbiItem(
          "event GM(address indexed user, uint256 timestamp)"
        );
        console.log("[GM Logs Retry] Querying logs", {
          latest: latest.toString(),
          fromBlock: fromBlock.toString(),
        });
        const logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: gmEvent,
          fromBlock,
          toBlock: latest,
        });
        console.log("[GM Logs Retry] Logs count:", logs.length);

        if (logs.length === 0) {
          setCarouselItems([]);
          console.log("[GM Logs Retry] No logs found.");
          return;
        }

        const uniqueAddresses = [];
        const seen = new Set();

        for (
          let i = logs.length - 1;
          i >= 0 && uniqueAddresses.length < 5;
          i--
        ) {
          const addr = logs[i].args.user;
          if (!seen.has(addr)) {
            seen.add(addr);
            uniqueAddresses.push(addr);
          }
        }

        console.log("[GM Logs Retry] Unique addresses:", uniqueAddresses);

        const short = uniqueAddresses.map(
          (a) => `${a.slice(0, 6)}...${a.slice(-4)}`
        );
        console.log("[GM Logs Retry] Carousel addresses:", short);
        setCarouselItems([...short, ...short, ...short, ...short]);
      } catch (e2) {
        console.error("Retry logs failed:", e2);
        console.log(
          "[GM Contract Fallback] Sampling users by last GM timestamp..."
        );
        try {
          const total = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: GM_ABI,
            functionName: "totalUsers",
          });
          const totalNum = Number(total);
          console.log("[GM Contract Fallback] totalUsers:", totalNum);
          if (totalNum === 0) {
            setCarouselItems([]);
            console.log("[GM Contract Fallback] No users.");
            return;
          }

          const maxScan = Math.min(totalNum, 50);
          const start = Math.max(0, totalNum - maxScan);
          const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;

          const recentAddrs = [];
          for (
            let i = totalNum - 1;
            i >= start && recentAddrs.length < 5;
            i--
          ) {
            try {
              const user = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: GM_ABI,
                functionName: "userAt",
                args: [BigInt(i)],
              });
              const [, last] = await publicClient.readContract({
                address: CONTRACT_ADDRESS,
                abi: GM_ABI,
                functionName: "getUser",
                args: [user],
              });
              if (Number(last) * 1000 >= cutoffMs) {
                recentAddrs.push(user);
              }
            } catch {}
          }

          console.log(
            "[GM Contract Fallback] Recent addresses (24h):",
            recentAddrs
          );

          const short = recentAddrs.map(
            (a) => `${a.slice(0, 6)}...${a.slice(-4)}`
          );
          console.log("[GM Contract Fallback] Carousel addresses:", short);
          setCarouselItems(
            short.length ? [...short, ...short, ...short, ...short] : []
          );
        } catch (e3) {
          console.error("Contract fallback failed:", e3);
          setCarouselItems([]);
        }
      }
    }
  }, [publicClient]);
  // ... existing code ...
  useEffect(() => {
    loadRecentGms();
  }, [loadRecentGms]);

  const farcasterConnector = connectors.find((c) =>
    c.id?.toLowerCase().includes("farcaster")
  );

  const handleGmClick = async () => {
    setError("");
    if (!isConnected) {
      setError("Please connect your Farcaster wallet first.");
      return;
    }
    if (isWriting || remaining > 0) return;

    try {
      // OPTIMISTIC UPDATE: Update UI immediately
      const newCount = saidGm + 1;
      const newTimestamp = Date.now();
      setSaidGm(newCount);
      setLastGmAt(newTimestamp);
      setGmCount((c) => c + 1);

      // Send transaction
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: GM_ABI,
        functionName: "sayGM",
        value: parseEther(GM_COST_ETH),
      });

      // Wait for confirmation in background
      publicClient
        .waitForTransactionReceipt({ hash })
        .then(async () => {
          // Verify actual values from contract
          const [count, last] = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: GM_ABI,
            functionName: "getUser",
            args: [address],
          });
          setSaidGm(Number(count));
          setLastGmAt(Number(last) * 1000);

          // Reload carousel with new GM
          loadRecentGms();
        })
        .catch((e) => {
          console.error("Transaction confirmation failed:", e);
          // Revert optimistic update on failure
          setSaidGm(newCount - 1);
          setLastGmAt(null);
          setGmCount((c) => c - 1);
          setError("Transaction failed to confirm.");
        });
    } catch (e) {
      // Revert optimistic update on error
      setSaidGm(saidGm);
      setLastGmAt(lastGmAt);
      setGmCount((c) => c - 1);
      setError(e?.shortMessage || e?.message || "Transaction failed.");
      console.error("GM transaction failed:", e);
    }
  };

  // Show minimal loading state
  if (isInitialLoad) {
    return (
      <div style={styles.appContainer}>
        <style>{keyframesCSS}</style>
        <div style={styles.centerSection}>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#666" }}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      <style>{keyframesCSS}</style>

      {/* Header Section */}
      <div style={styles.header}>
        <div style={styles.stats}>
          <p style={styles.statText}>Your GMs: {saidGm}</p>
          <p style={styles.statText}>GMs received: {receivedGm}</p>
          <p style={styles.statText}>
            Overall GM Count: {gmCount.toLocaleString()}
          </p>
          <div style={styles.trophyIcon}>
            <img
              src="https://gmminiapp.vercel.app/leaderboard.png"
              alt="leaderboard"
              width="48"
              height="48"
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
          <div style={styles.countdownText}>
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
            style={{
              ...styles.gmBtn,
              ...((!isConnected || isWriting) && styles.gmBtnDisabled),
            }}
            onClick={handleGmClick}
            disabled={!isConnected || isWriting}
          >
            <span style={styles.gmBtnText}>
              {isWriting ? "SENDING..." : "HIT TO SAY 'GM'"}
            </span>
          </button>
        )}
      </div>

      {error && <div style={styles.errorText}>{error}</div>}

      {/* Carousel Footer */}
      {carouselItems.length > 0 && (
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
      )}
    </div>
  );
}

const keyframesCSS = `
  @keyframes scroll {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-25%);
    }
  }
`;

const styles = {
  appContainer: {
    width: "100%",
    height: "100dvh",
    margin: "0",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    background: "#fff",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif",
    position: "relative",
    overflow: "hidden",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    flexShrink: 0,
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
    color: "#000",
  },
  walletBtn: {
    padding: "10px 12px",
    border: "2px solid #000",
    borderRadius: "8px",
    background: "#fff",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "0.75rem",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "transform 0.2s",
  },
  centerSection: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
    minHeight: "0",
  },
  gmBtn: {
    width: "min(220px, 60vw)",
    height: "min(220px, 60vw)",
    background: "#0000FF",
    border: "none",
    borderRadius: "50%",
    fontSize: "1.4rem",
    fontWeight: "700",
    color: "#FFFFFF",
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(0, 0, 255, 0.3)",
    transition: "transform 0.2s, box-shadow 0.2s, opacity 0.2s",
  },
  gmBtnDisabled: {
    opacity: 1,
    cursor: "not-allowed",
  },
  gmBtnText: {
    display: "block",
    lineHeight: "1.5",
  },
  countdownText: {
    textAlign: "center",
    fontSize: "1.5rem",
    fontWeight: "700",
    color: "#000",
  },
  errorText: {
    textAlign: "center",
    color: "#ff0000",
    fontSize: "0.85rem",
    padding: "10px",
    flexShrink: 0,
  },
  carouselContainer: {
    width: "calc(100% + 40px)",
    marginLeft: "-20px",
    marginRight: "-20px",
    overflow: "hidden",
    position: "relative",
    paddingBottom: "10px",
    flexShrink: 0,
  },
  carousel: {
    display: "flex",
    gap: "30px",
    animation: "scroll 20s linear infinite",
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
};

export default App;
