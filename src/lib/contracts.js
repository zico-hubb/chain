import { ethers } from "ethers";
import HakiTokenABI from "../abis/HakiToken.json";
import BountyRegistryABI from "../abis/BountyRegistry.json";
import BountyEscrowABI from "../abis/BountyEscrow.json";

export let provider, signer, token, registry, escrow;

export const initContracts = async () => {
  if (!window.ethereum) throw new Error("MetaMask not installed");
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();

  token = new ethers.Contract(
    process.env.NEXT_PUBLIC_TOKEN_ADDRESS,
    HakiTokenABI,
    signer
  );
  registry = new ethers.Contract(
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
    BountyRegistryABI,
    signer
  );
  escrow = new ethers.Contract(
    process.env.NEXT_PUBLIC_ESCROW_ADDRESS,
    BountyEscrowABI,
    signer
  );
};
