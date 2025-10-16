// app/api/pin-lsk/route.js
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();

    // Determine type: lawyer, NGO, or donor
    const { lsk, ngoId, donorId } = body;

    let payload;

    if (lsk) {
      // Lawyer flow
      payload = {
        type: "lawyer",
        name: "Lawyer LSK",
        description: "LSK number for lawyer (Haki)",
        lsk,
        timestamp: new Date().toISOString(),
      };
    } else if (ngoId) {
      // NGO flow
      payload = {
        type: "ngo",
        name: "NGO Identity",
        description: "NGO ID for Haki platform",
        ngoId,
        timestamp: new Date().toISOString(),
      };
    } else if (donorId) {
      // Donor flow
      payload = {
        type: "donor",
        name: "Donor Identity",
        description: "Donor ID for Haki platform",
        donorId,
        timestamp: new Date().toISOString(),
      };
    } else {
      return NextResponse.json(
        { error: "missing lsk, ngoId, or donorId" },
        { status: 400 }
      );
    }

    // Pinata authorization
    const PINATA_JWT = process.env.PINATA_JWT;
    const PINATA_API_KEY = process.env.PINATA_API_KEY;
    const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;

    const headers = { "Content-Type": "application/json" };
    if (PINATA_JWT) {
      headers.Authorization = `Bearer ${PINATA_JWT}`;
    } else if (PINATA_API_KEY && PINATA_SECRET_API_KEY) {
      headers.pinata_api_key = PINATA_API_KEY;
      headers.pinata_secret_api_key = PINATA_SECRET_API_KEY;
    } else {
      return NextResponse.json(
        { error: "Pinata credentials not configured" },
        { status: 500 }
      );
    }

    // Pin JSON to IPFS
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Pinata error:", res.status, text);
      return NextResponse.json({ error: "pinata failed", details: text }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ cid: data.IpfsHash });
  } catch (err) {
    console.error("Server pin error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
