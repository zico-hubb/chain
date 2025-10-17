"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import BountyRegistryABI from "../../abis/BountyRegistry.json";
import BountyEscrowABI from "../../abis/BountyEscrow.json";
import HakiTokenABI from "../../abis/HakiToken.json";
import HomeButton from "../components/HomeButton";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_REGISTRY;
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;

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

export default function AdminPage() {
  const [bounties, setBounties] = useState([]);
  const [milestones, setMilestones] = useState({});
  const [donorContributions, setDonorContributions] = useState({});
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [escrow, setEscrow] = useState(null);
  const [token, setToken] = useState(null);
  const [address, setAddress] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);

  const switchToSepolia = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }], // 11155111 in hex
      });
      console.log("DEBUG: Switched to Sepolia ✅");
    } catch (switchError) {
      if (switchError.code === 4902) {
        console.warn("DEBUG: Sepolia not found, adding network...");
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0xaa36a7",
              chainName: "Sepolia Test Network",
              rpcUrls: ["https://sepolia.infura.io/v3/<YOUR_INFURA_KEY>"],
              nativeCurrency: {
                name: "Sepolia ETH",
                symbol: "ETH",
                decimals: 18,
              },
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            }],
          });
          console.log("DEBUG: Sepolia network added ✅");
        } catch (addError) {
          console.error("DEBUG: Failed to add Sepolia:", addError);
          alert("⚠️ Failed to add Sepolia network to MetaMask.");
        }
      } else {
        console.error("DEBUG: Failed to switch network:", switchError);
        alert("⚠️ Failed to switch MetaMask network to Sepolia.");
      }
    }
  };

  const connectWallet = async () => {
    try {
      setIsConnecting(true);
      if (!window.ethereum) {
        alert("No Ethereum provider found. Please install MetaMask.");
        return;
      }

      const prov = new ethers.BrowserProvider(window.ethereum);
      await prov.send("eth_requestAccounts", []);
      const sign = await prov.getSigner();
      const userAddr = await sign.getAddress();

      // ✅ Force Sepolia network with auto-switch
      let network = await prov.getNetwork();
      console.log("DEBUG: Connected network object:", network);
      if (network.chainId !== 11155111n) { // <-- FIX: compare with BigInt
        console.warn("DEBUG: Wrong network! Attempting to switch to Sepolia...");
        await switchToSepolia();
        network = await prov.getNetwork();
        console.log("DEBUG: Network after switch attempt:", network);
        if (network.chainId !== 11155111n) {
          alert("⚠️ Please switch your MetaMask network to Sepolia.");
          return;
        }
      } else {
        console.log("DEBUG: User is already on Sepolia ✅");
      }

      const cont = new ethers.Contract(CONTRACT_ADDRESS, BountyRegistryABI.abi, sign);
      const esc = new ethers.Contract(ESCROW_ADDRESS, BountyEscrowABI.abi, sign);
      const tok = new ethers.Contract(TOKEN_ADDRESS, HakiTokenABI.abi, sign);

      setProvider(prov);
      setSigner(sign);
      setAddress(userAddr);
      setContract(cont);
      setEscrow(esc);
      setToken(tok);

      // Fetch roles
      const roles = [];
      for (const [roleName, roleHash] of Object.entries(ROLES)) {
        if (await cont.hasRole(roleHash, userAddr)) roles.push(roleName);
      }
      setUserRoles(roles);
    } catch (err) {
      console.error("Failed to connect wallet:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  const fetchBounties = async () => {
    if (!contract || !escrow) return;

    try {
      const loadedBounties = await contract.getAllBounties();
      const milestoneMap = {};
      const contributionMap = {};

      for (const b of loadedBounties) {
        const ms = await contract.getAllMilestones(b.id);
        milestoneMap[b.id] = ms.map((m) => ({
          amount: ethers.formatEther(m.amount),
          approved: m.approved,
          released: m.released,
        }));

        let donors = [];
        try {
          donors = await escrow.getDonors(b.id);
        } catch {}

        const contrib = {};
        for (const donor of donors) {
          const amt = await escrow.getDonorContribution(b.id, donor);
          contrib[donor] = ethers.formatEther(amt);
        }
        contributionMap[b.id] = contrib;
      }

      setBounties(loadedBounties);
      setMilestones(milestoneMap);
      setDonorContributions(contributionMap);
    } catch (err) {
      console.error(err);
    }
  };

  const approveMilestone = async (bountyId, milestoneId) => {
    if (!contract) return;
    try {
      const tx = await contract.approveMilestone(bountyId, milestoneId);
      await tx.wait();
      alert(`Milestone ${milestoneId} approved for bounty ${bountyId}`);
    } catch (err) {
      console.error(err);
      alert("Failed to approve milestone.");
    }
  };

  const setEscrowAddress = async () => {
    if (!contract) return;
    const escrowAddr = prompt("Enter new escrow contract address:");
    if (!escrowAddr) return;

    try {
      const tx = await contract.setEscrow(escrowAddr);
      await tx.wait();
      alert("✅ Escrow set successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to set escrow");
    }
  };

  useEffect(() => {
    if (!contract || !escrow) return;

    fetchBounties();

    const handler = async () => fetchBounties();

    const bountyCreatedFilter = contract.filters.BountyCreated();
    const bountyUpdatedFilter = contract.filters.BountyUpdated?.();
    const milestoneApprovedFilter = contract.filters.MilestoneApproved();
    const donationReceivedFilter = escrow.filters.DonationReceived?.();

    contract.on(bountyCreatedFilter, handler);
    contract.on(milestoneApprovedFilter, handler);
    if (bountyUpdatedFilter) contract.on(bountyUpdatedFilter, handler);
    if (donationReceivedFilter) escrow.on(donationReceivedFilter, handler);

    return () => {
      contract.off(bountyCreatedFilter, handler);
      contract.off(milestoneApprovedFilter, handler);
      if (bountyUpdatedFilter) contract.off(bountyUpdatedFilter, handler);
      if (donationReceivedFilter) escrow.off(donationReceivedFilter, handler);
    };
  }, [contract, escrow]);

  return (
    <div className="container">
      <style>{`
        .container {
          max-width: 900px;
          margin: 0 auto;
          padding: 1.5rem;
          background: #fff;
          color: #000;
          font-family: sans-serif;
        }
        h1 { font-size: 1.8rem; margin-bottom: 1rem; }
        h2 { font-size: 1.2rem; margin-top: 1rem; font-weight: bold; }
        h3 { font-size: 1rem; margin-top: 0.5rem; font-weight: bold; }
        p { margin: 0.3rem 0; }
        button {
          cursor: pointer;
          border: none;
          border-radius: 4px;
          padding: 0.4rem 0.8rem;
          margin: 0.2rem 0;
          font-size: 0.9rem;
        }
        .btn-connect { background: #000; color: #fff; }
        .btn-accent { background: #0070f3; color: #fff; }
        .btn-admin { background: #800080; color: #fff; }
        .bounty-card {
          border: 1px solid #000;
          padding: 0.8rem;
          margin-bottom: 1rem;
          border-radius: 6px;
        }
        .milestone {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.3rem;
        }
      `}</style>

      <h1>Admin Dashboard</h1>

      {!address ? (
        <button
          onClick={connectWallet}
          disabled={isConnecting}
          className="btn-connect"
        >
          {isConnecting ? "Connecting..." : "🔗 Connect Wallet"}
        </button>
      ) : (
        <>
          <p>Connected: <b style={{color: "green"}}>{address}</b></p>
          {userRoles.length > 0 ? (
            <p style={{ color: "green", fontWeight: "bold" }}>
              Roles: {userRoles.join(", ")}
            </p>
          ) : (
            <p style={{ color: "red" }}>No roles assigned.</p>
          )}
        </>
      )}

      {userRoles.includes("ADMIN_ROLE") && (
        <button onClick={setEscrowAddress} className="btn-admin">
          🛡️ Set Escrow Contract (Admin Only)
        </button>
      )}

      {bounties.length === 0 && address && <p>No bounties found.</p>}

      {bounties.map((b) => (
        <div key={b.id} className="bounty-card">
          <h2>Bounty #{b.id}</h2>
          <p>NGO: {b.ngo}</p>
          <p>Active: {b.active ? "Yes" : "No"}</p>
          <p>Lawyer Assigned: {b.assignedLawyer || "None"}</p>

          <h3>Milestones</h3>
          {milestones[b.id]?.map((m, idx) => (
            <div key={idx} className="milestone">
              <span>
                Milestone {idx} — Amount: {m.amount} HAKI — Approved:{" "}
                {m.approved ? "✅" : "❌"} — Released: {m.released ? "✅" : "❌"}
              </span>
              {!m.approved &&
                (userRoles.includes("CASE_STEWARD_ROLE") ||
                  userRoles.includes("ADMIN_ROLE")) && (
                  <button
                    onClick={() => approveMilestone(b.id, idx)}
                    className="btn-accent"
                  >
                    Approve
                  </button>
                )}
            </div>
          ))}

          <h3>Donor Contributions</h3>
          {donorContributions[b.id] &&
            Object.entries(donorContributions[b.id]).map(([donor, amt]) => (
              <p key={donor}>
                {donor}: {amt} HAKI
              </p>
            ))}
        </div>
      ))}
      <div>
        <HomeButton />
      </div>
    </div>
  );
}
