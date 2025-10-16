"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import BountyRegistryABI from "../../abis/BountyRegistry.json";
import BountyEscrowABI from "../../abis/BountyEscrow.json";
import HakiTokenABI from "../../abis/HakiToken.json";

export default function DonorPage() {
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [registry, setRegistry] = useState(null);
  const [escrow, setEscrow] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const [donorId, setDonorId] = useState("");
  const [cid, setCid] = useState("");
  const [bountyId, setBountyId] = useState("");
  const [amount, setAmount] = useState("");

  const [donorContributions, setDonorContributions] = useState({});
  const [escrowBalances, setEscrowBalances] = useState({});
  const [allBounties, setAllBounties] = useState([]);

  const SEPOLIA_CHAIN_ID = "0xaa36a7";

  /*** NETWORK & WALLET ***/
  const switchToSepolia = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (err) {
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_ID,
                chainName: "Sepolia Test Network",
                rpcUrls: ["https://sepolia.infura.io/v3/<YOUR_INFURA_KEY>"],
                nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        } catch (addErr) {
          console.error("Failed to add Sepolia:", addErr);
          alert("⚠️ Failed to add Sepolia network.");
        }
      } else {
        console.error("Failed to switch network:", err);
        alert("⚠️ Failed to switch to Sepolia.");
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) return alert("MetaMask not found");

    try {
      setIsConnecting(true);
      const prov = new ethers.BrowserProvider(window.ethereum);
      await prov.send("eth_requestAccounts", []);
      const sign = await prov.getSigner();
      const addr = await sign.getAddress();

      let network = await prov.getNetwork();
      if (network.chainId !== 11155111) await switchToSepolia();

      const tokenContract = new ethers.Contract(
        process.env.NEXT_PUBLIC_TOKEN_ADDRESS,
        HakiTokenABI.abi,
        sign
      );
      const registryContract = new ethers.Contract(
        process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
        BountyRegistryABI.abi,
        sign
      );
      const escrowContract = new ethers.Contract(
        process.env.NEXT_PUBLIC_ESCROW_ADDRESS,
        BountyEscrowABI.abi,
        sign
      );

      setSigner(sign);
      setAccount(addr);
      setToken(tokenContract);
      setRegistry(registryContract);
      setEscrow(escrowContract);

      await fetchDonorData(registryContract, escrowContract, addr);

      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) setAccount("");
        else setAccount(accounts[0]);
      });
      window.ethereum.on("chainChanged", () => window.location.reload());
    } catch (err) {
      console.error(err);
      alert("Wallet connection failed: " + err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  // ---------- KEEP ALL ORIGINAL FUNCTIONS INTACT ----------
  const registerDonor = async () => {
    if (!donorId || !registry || !signer) return alert("Enter Donor ID & connect wallet");

    setLoading(true);
    try {
      const payload = { donorId };
      const res = await fetch("/api/pin-lsk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Pinning failed");
      const pinned = await res.json();
      const pinnedCid = pinned.cid;
      setCid(pinnedCid);

      const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";
      const verifyRes = await fetch(`${gateway}/${pinnedCid}`);
      const parsed = await verifyRes.json();
      const payloadHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(parsed)));

      const tx = await registry.registerDonor(pinnedCid, payloadHash);
      await tx.wait();

      alert(`✅ Donor registered on-chain.\nCID: ${pinnedCid}`);
      await fetchDonorData(registry, escrow, account);
    } catch (err) {
      console.error(err);
      alert(`Donor registration failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fundBounty = async () => {
    if (!bountyId || !amount || !escrow || !token || !account) return alert("Enter bountyId & amount");

    try {
      const weiAmount = ethers.parseUnits(amount, 18);
      const approveTx = await token.approve(process.env.NEXT_PUBLIC_ESCROW_ADDRESS, weiAmount);
      await approveTx.wait();
      const depositTx = await escrow.deposit(bountyId, account, weiAmount);
      await depositTx.wait();
      alert(`✅ Donor funded bounty ${bountyId} with ${amount} HAKI`);
      await fetchDonorData(registry, escrow, account);
    } catch (err) {
      console.error(err);
      alert("Funding failed: " + err.message);
    }
  };

  const fetchDonorData = async (registryContract, escrowContract, donorAddress) => {
    try {
      const bounties = await registryContract.getAllBounties();
      setAllBounties(bounties);

      const contribs = {};
      const balances = {};

      for (const b of bounties) {
        const bountyId = b.id;
        const c = await escrowContract.getDonorContribution(bountyId, donorAddress);
        contribs[bountyId] = ethers.formatUnits(c, 18);
        const balance = await escrowContract.getBountyBalance(bountyId);
        balances[bountyId] = ethers.formatUnits(balance, 18);
      }

      setDonorContributions(contribs);
      setEscrowBalances(balances);
    } catch (err) {
      console.error("fetchDonorData error:", err);
    }
  };

  return (
    <div className="container">
      <style>{`
        .container { max-width: 900px; margin:0 auto; padding:1.5rem; background:#fff; color:#000; font-family:sans-serif; }
        h1 { font-size:1.8rem; margin-bottom:1rem; }
        h2 { font-size:1.2rem; margin-top:1rem; font-weight:bold; }
        label { display:block; margin-top:12px; }
        input { display:block; width:100%; padding:0.5rem; margin-top:6px; border:1px solid #000; border-radius:4px; }
        button { cursor:pointer; border:none; border-radius:4px; padding:0.4rem 0.8rem; margin-top:6px; font-size:0.9rem; }
        .btn-accent { background:#0070f3; color:#fff; }
        .bounty-card { border:1px solid #ccc; border-radius:4px; padding:12px; margin-top:12px; }
        a { color:#0070f3; text-decoration:underline; }
      `}</style>

      <h1>Donor Dashboard</h1>

      {!account ? (
        <button className="btn-accent" onClick={connectWallet} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : (
        <p>Connected: <b>{account}</b></p>
      )}

      <div style={{ marginTop: 12, maxWidth: 600 }}>
        <label>Donor ID / Name:</label>
        <input type="text" value={donorId} onChange={(e) => setDonorId(e.target.value)} />
        <button onClick={registerDonor} disabled={loading || !signer} className="btn-accent">
          {loading ? "Registering..." : "Register Donor On-Chain"}
        </button>
      </div>

      {cid && (
        <p style={{ marginTop: 12 }}>
          Pinned CID:{" "}
          <a href={`https://gateway.pinata.cloud/ipfs/${cid}`} target="_blank" rel="noreferrer">
            {cid}
          </a>
        </p>
      )}

      <h2>Fund a Bounty</h2>
      <input type="text" placeholder="Bounty ID" value={bountyId} onChange={(e) => setBountyId(e.target.value)} />
      <input type="text" placeholder="Amount (HAKI)" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button onClick={fundBounty} className="btn-accent">Fund Bounty</button>

      <h2>Your Contributions & Bounty Balances</h2>
      {allBounties.length === 0 && <p>No bounties available yet.</p>}
      {allBounties.map((b) => (
        <div key={b.id} className="bounty-card">
          <p>Bounty ID: {b.id}</p>
          <p>Active: {b.active ? "Yes" : "No"}</p>
          <p>Lawyer Selected: {b.lawyerSelected ? "Yes" : "No"}</p>
          <p>Total Escrow Balance: {escrowBalances[b.id] ?? "0"} HAKI</p>
          <p>Your Contribution: {donorContributions[b.id] ?? "0"} HAKI</p>
        </div>
      ))}
    </div>
  );
}
