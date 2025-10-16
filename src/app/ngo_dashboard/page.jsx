"use client";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import HakiTokenABI from "../../abis/HakiToken.json";
import BountyRegistryABI from "../../abis/BountyRegistry.json";
import BountyEscrowABI from "../../abis/BountyEscrow.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS;

const ROLES = {
  ADMIN_ROLE:
    "0xf23a6e3e6a9d3ff4e9f1d4fba2bbfe5edac2ffb87d3caaabcb246df9e4cb52f2",
  CASE_STEWARD_ROLE:
    "0xb52a0e93c274e53d5840a22ac681e47abf90d7f3b7850e7ba1c6641ecb5b40ad",
  NGO_ROLE:
    "0x1b4e2bcad84346b7f412505cbecf9f08ae814a25560718182c9b3f56847bfb3e",
  DONOR_ROLE:
    "0x756b0334d911da1e4c1a010bf7cb2ac2273a6dc5d2a5524f33a3eb18dc8d2b47",
  LAWYER_ROLE:
    "0xe46f1b29c7c4ff1df2a8c6b6c179e52f1d9b93a99a26c592e564af8a963a8b2b",
};

export default function NGOPage() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [registry, setRegistry] = useState(null);
  const [escrow, setEscrow] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);

  const [ngoId, setNgoId] = useState("");
  const [cid, setCid] = useState("");
  const [loading, setLoading] = useState(false);

  const [milestones, setMilestones] = useState(["0", "0", "0"]);
  const [ngoBounties, setNgoBounties] = useState([]);
  const [ngoMilestones, setNgoMilestones] = useState({});
  const [ngoApplications, setNgoApplications] = useState({});

  /*** NETWORK & WALLET ***/
  const switchToSepolia = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }], // Sepolia
      });
    } catch (err) {
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0xaa36a7",
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

      const registryContract = new ethers.Contract(CONTRACT_ADDRESS, BountyRegistryABI.abi, sign);
      const escrowContract = new ethers.Contract(ESCROW_ADDRESS, BountyEscrowABI.abi, sign);

      setProvider(prov);
      setSigner(sign);
      setAccount(addr);
      setRegistry(registryContract);
      setEscrow(escrowContract);

      const roles = [];
      for (const [name, hash] of Object.entries(ROLES)) {
        if (await registryContract.hasRole(hash, addr)) roles.push(name);
      }
      setUserRoles(roles);

      await fetchNGOData(registryContract, addr);
    } catch (err) {
      console.error(err);
      alert("Wallet connection failed: " + err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  /*** NGO REGISTRATION ***/
  const registerNGO = async () => {
    if (!ngoId || !registry || !signer) return alert("Enter NGO ID & connect wallet");

    setLoading(true);
    try {
      // Pin LSK payload
      const payload = { ngoId };
      const res = await fetch("/api/pin-lsk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const pinned = await res.json();
      setCid(pinned.cid);

      // Compute hash
      const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";
      const verifyRes = await fetch(`${gateway}/${pinned.cid}`);
      const parsed = await verifyRes.json();
      const recomputed = JSON.stringify(parsed);
      const payloadHash = ethers.keccak256(ethers.toUtf8Bytes(recomputed));

      // Register on-chain
      const tx = await registry.registerNGO(pinned.cid, payloadHash);
      await tx.wait();

      alert(`✅ NGO registered. CID: ${pinned.cid}`);
      await fetchNGOData(registry, account);
    } catch (err) {
      console.error(err);
      alert("NGO registration failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /*** BOUNTY MANAGEMENT ***/
  const createBounty = async () => {
    if (!registry || !signer) return alert("Connect wallet first");

    const identity = await registry.getNGOIdentity(account);
    if (!identity || identity.payloadHash === ethers.ZeroHash)
      return alert("NGO identity not found. Register first.");

    const amounts = milestones.map((m) => ethers.parseEther(m.toString()));
    const tx = await registry.createBounty(amounts);
    await tx.wait();

    alert("✅ Bounty created");
    await fetchNGOData(registry, account);
  };

  const approveMilestone = async (bountyId, idx) => {
    if (!registry || !signer) return;
    const tx = await registry.approveMilestone(bountyId, idx);
    await tx.wait();
    await fetchNGOData(registry, account);
  };

  const releaseMilestoneFunds = async (bountyId, idx) => {
    if (!escrow || !signer) return;
    const tx = await escrow.release(bountyId, idx);
    await tx.wait();
    await fetchNGOData(registry, account);
  };

  /*** FETCH NGO DATA ***/
  const fetchNGOData = async (registryContract, addr) => {
    const allBounties = await registryContract.getAllBounties();
    const ngoB = allBounties.filter((b) => b.ngo.toLowerCase() === addr.toLowerCase());
    setNgoBounties(ngoB);

    const milestonesMap = {};
    const applicationsMap = {};

    for (const b of ngoB) {
      milestonesMap[b.id] = await registryContract.getAllMilestones(b.id);
      applicationsMap[b.id] = await registryContract.getApplications(b.id);
    }

    setNgoMilestones(milestonesMap);
    setNgoApplications(applicationsMap);
  };

  /*** RENDER ***/
  return (
    <div className="admin-container">
      <h1>NGO Dashboard</h1>

      {!account ? (
        <button onClick={connectWallet} disabled={isConnecting} className="btn-accent">
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : (
        <p>Connected: <b style={{color: "green"}}>{account}</b></p>
      )}

      <section className="card">
        <h2>Register NGO</h2>
        <input
          type="text"
          placeholder="Enter NGO ID"
          value={ngoId}
          onChange={(e) => setNgoId(e.target.value)}
        />
        <button onClick={registerNGO} disabled={loading || !signer} className="btn-accent">
          {loading ? "Registering..." : "Register NGO On-Chain"}
        </button>
        {cid && (
          <p>
            Pinned CID:{" "}
            <a href={`${process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud/ipfs"}/${cid}`} target="_blank" rel="noreferrer">
              {cid}
            </a>
          </p>
        )}
      </section>

      <section className="card">
        <h2>Create Bounty</h2>
        {milestones.map((m, i) => (
          <input
            key={i}
            type="number"
            placeholder={`Milestone ${i}`}
            value={m}
            onChange={(e) => {
              const newM = [...milestones];
              newM[i] = e.target.value;
              setMilestones(newM);
            }}
          />
        ))}
        <button onClick={createBounty} className="btn-accent">Create Bounty</button>
      </section>

      <section className="card">
        <h2>Your Bounties</h2>
        {ngoBounties.length === 0 && <p>No bounties yet.</p>}
        {ngoBounties.map((b) => (
          <div key={b.id} className="bounty-card">
            <p>Bounty ID: {b.id}</p>
            <p>Active: {b.active ? "Yes" : "No"}</p>
            <p>Lawyer Selected: {b.lawyerSelected ? "Yes" : "No"}</p>

            <h4>Milestones</h4>
            {ngoMilestones[b.id]?.map((m, idx) => (
              <div key={idx} className="milestone-row">
                <span>
                  Milestone {idx}: {ethers.formatEther(m.amount)} ETH | Approved: {m.approved ? "Yes" : "No"} | Released: {m.released ? "Yes" : "No"}
                </span>
                {!m.approved && (
                  <button onClick={() => approveMilestone(b.id, idx)} className="btn-accent small-btn">
                    Approve
                  </button>
                )}
                {m.approved && !m.released && (
                  <button onClick={() => releaseMilestoneFunds(b.id, idx)} className="btn-accent small-btn">
                    Release Funds
                  </button>
                )}
              </div>
            ))}

            <h4>Applications</h4>
            {ngoApplications[b.id]?.length === 0 && <p>No lawyer applications yet.</p>}
            {ngoApplications[b.id]?.map((app, idx) => (
              <p key={idx}>
                Lawyer: {app.lawyer} | Proposal: {app.proposalURI} | Accepted: {app.accepted ? "Yes" : "No"}
              </p>
            ))}
          </div>
        ))}
      </section>

      <style jsx>{`
        .admin-container { max-width: 900px; margin: 0 auto; padding: 1.5rem; font-family: sans-serif; }
        .card { border: 1px solid #ccc; padding: 1rem; margin: 1rem 0; border-radius: 8px; }
        input { display: block; width: 100%; margin: 0.5rem 0; padding: 0.5rem; border-radius: 4px; border: 1px solid #000; }
        button { padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin-top: 0.5rem; border: none; }
        .btn-accent { background: #0070f3; color: #fff; }
        .bounty-card { border: 1px solid #ddd; padding: 0.5rem; margin: 0.5rem 0; border-radius: 6px; }
        .milestone-row { display: flex; align-items: center; justify-content: space-between; margin: 0.3rem 0; }
        .small-btn { padding: 0.25rem 0.5rem; font-size: 0.8rem; }
        a { color: #0070f3; text-decoration: underline; }
      `}</style>
    </div>
  );
}
